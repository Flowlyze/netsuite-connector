/**
 * @NApiVersion 2.x
 * @NScriptType ScheduledScript
 */
define(['N/https', 'N/log', 'N/runtime', 'N/search'], function (https, log, runtime, search) {

    /**
     * Entry point for the scheduled script. This function orchestrates the retrieval,
     * processing, and acknowledgement of messages from a Flowlyze queue.
     *
     * @param {Object} context - The script context object.
     */
    function execute(context) {
        try {
            log.debug('Starting GET request', 'Fetching messages from Flowlyze queue');

            // Get the current script object to retrieve script parameters.
            var scriptObj = runtime.getCurrentScript();

            // Retrieve the maximum number of items to process from the script parameter, defaulting to 10 if not provided.
            var maxItems = scriptObj.getParameter({ name: 'custscript_fly_max_items' }) || 10;

            // Retrieve the flow name from the script parameter.
            var flow = scriptObj.getParameter({ name: 'custscript_fly_int_flow' });

            // Retrieve the path to the logic module from the script parameter.
            var logicModulePath = scriptObj.getParameter({ name: 'custscript_fly_logic_module' });

            // Ensure that the logic module path is specified; throw an error if it's missing.
            if (!logicModulePath) {
                throw new Error('Parameter "custscript_fly_logic_module" not specified.');
            }

            log.debug('maxItems', maxItems);
            log.debug('flow', flow);
            log.debug('logicModulePath', logicModulePath);

            // Retrieve the integration configuration record based on the flow name.
            var integrationConfig = getIntegrationConfigRecord(flow);
            if (!integrationConfig) throw new Error('Integration configuration not found for flow: ' + flow);

            // Fetch messages from the Flowlyze queue using the integration configuration.
            var messages = fetchMessages(integrationConfig, maxItems);

            // If a logic module path is provided, require the module and process the messages using the custom logic.
            if (logicModulePath) {
                require([logicModulePath], function (customModule) {
                    // Process the messages with the custom logic from the required module.
                    processMessagesWithLogic(messages, customModule, integrationConfig);
                });
            } 
        } catch (error) {
            // Log any errors that occur during the execution of the script.
            log.error('Error during execution', error);
        }
    }

    function getIntegrationConfigRecord(flow) {
        try {
            // Create a search for the integration configuration record
            var configSearch = search.create({
                type: 'customrecord_fly_flowlyze_integration',
                filters: [
                    ['custrecord_fly_flow_name', 'is', flow]
                ],
                columns: [
                    'custrecord_fly_url',
                    'custrecord_fly_api_key',
                    'custrecord_fly_flow_name',
                    'custrecord_fly_entity_name'
                ]
            });

            // Get the results of the search
            var configResults = configSearch.run().getRange({ start: 0, end: 1 });

            // If a record is found, return the configuration object
            if (configResults.length > 0) {
                var configResult = configResults[0];
                return {
                    flow: flow,
                    entityName: configResult.getValue('custrecord_fly_entity_name'),
                    url: configResult.getValue('custrecord_fly_url'),
                    apiKey: configResult.getValue('custrecord_fly_api_key'),
                };
            } else {
                log.error('Integration Config Not Found', 'No integration configuration found for flow: ' + flow);
                return null;
            }
        } catch (e) {
            log.error('Error retrieving integration config: ' + e.message);
            return null;
        }
    }

    /**
     * Fetches messages from the Flowlyze queue based on the integration configuration.
     *
     * @param {Object} integrationConfig - The configuration object containing URL and API key.
     * @param {number} maxItems - The maximum number of messages to fetch.
     * @returns {Array} An array of messages retrieved from the queue.
     */
    function fetchMessages(integrationConfig, maxItems) {
        // Makes a GET request to retrieve messages from the Flowlyze queue.
        var getResponse = https.get({
            url: integrationConfig.url + '?is-acknowledged?false&max-items=' + encodeURIComponent(maxItems),
            headers: { 'x-apikey': integrationConfig.apiKey }
        });

        log.debug('GET response status', getResponse.code);
        log.debug('GET response body', getResponse.body);

        try {
            var body = JSON.parse(getResponse.body);
            return body.messages || [];
        } catch (e) {
            log.error('Invalid JSON in GET response body', e.message);
            return [];
        }
    }

    /**
     * Processes each message using custom logic defined in an external module.
     * It also handles acknowledgement of each message based on the processing result.
     *
     * @param {Array} messages - An array of messages to process.
     * @param {Object} customModule - The module containing the custom processing logic.
     * @param {Object} integrationConfig - The integration configuration object.
     */
    function processMessagesWithLogic(messages, customModule, integrationConfig) {
        log.debug('Custom Logic Module Loaded', 'Processing messages with custom logic.');
        log.debug('Messages to process', JSON.stringify(messages));
        log.debug('Custom module keys', Object.keys(customModule));
        var functionName = 'processData';
        
        // Iterates over each message and processes it using the custom logic.
        for (var i = 0; i < messages.length; i++) {
            var message = messages[i];
            var ackStatus = 'Success';
            var ackErrorMessage = '';

            try {
                if (typeof customModule[functionName] === 'function') {
                    log.debug('Custom Function Found', 'Invoking ' + functionName);
                    var result = customModule[functionName](message.msg);

                    if (!result || result.success !== true) {
                        ackStatus = 'Error';
                        ackErrorMessage = (result && result.error) ? result.error : 'Unknown error in custom logic';
                        log.error('Custom Logic Error', ackErrorMessage);
                    }
                } else {
                    throw new Error('The custom module does not export a valid ' + functionName + ' function.');
                }
            } catch (e) {
                log.error('Error processing message', e.message);
                ackStatus = 'Error';
                ackErrorMessage = e.message;
            }

            acknowledgeMessage(message.msgId, ackStatus, ackErrorMessage, integrationConfig);
        }
    }

    /**
     * Sends an acknowledgement to Flowlyze for a specific message.
     *
     * @param {string} msgId - The ID of the message being acknowledged.
     * @param {string} status - The status of the message processing ('Success' or 'Error').
     * @param {string} errorMessage - An error message if the processing failed.
     * @param {Object} integrationConfig - The integration configuration object.
     */
    function acknowledgeMessage(msgId, status, errorMessage, integrationConfig) {
        try {
            log.debug('Starting POST request', 'Acknowledging message ' + msgId);
            log.debug('ACK Params', {
                msgId: msgId,
                status: status,
                errorMessage: errorMessage,
                integrationConfig: integrationConfig
            });

            // Prepares the acknowledgement body.
            var ackBody = JSON.stringify({
                isAsync: false,
                messages: [
                    {
                        msgId: msgId,
                        status: status,
                        errorMessage: errorMessage
                    }
                ]
            });

            var ackResponse = https.post({
                url: integrationConfig.url + '/acknowledge',
                headers: {
                    'x-apikey': integrationConfig.apiKey,
                    'Content-Type': 'application/json'
                },
                body: ackBody
            });

            log.debug('POST response status', ackResponse.code);
        } catch (ackError) {
            log.error('Error sending ACK for message ' + msgId, ackError.message);
        }
    }

    return {
        execute: execute
    };
});
