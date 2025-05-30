/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */
define(['N/search', 'N/https', 'N/runtime', 'N/record', 'N/file', 'N/log', 'N/format'], function (search, https, runtime, record, file, log, format) {
    /**
     * Defines the function that is executed at the beginning of the map/reduce process and generates the input data.
     * @param {Object} context
     * @returns {Array|Object|Search|RecordRef} The input data to be processed by the map() stage
     * @since 2015.2
     */
    function getInputData(context) {
        log.debug('Script Starts!');

        // Get the current script object to retrieve script parameters
        var scriptObj = runtime.getCurrentScript();

        // Retrieve the saved search ID from the script parameters
        var savedSearchId = scriptObj.getParameter({ name: 'custscript_fly_saved_search_id' });
        log.debug('savedSearchId', savedSearchId);

        // Retrieve the label of the last modified field from the script parameters
        var last_modified_field_label = scriptObj.getParameter({ name: 'custscript_last_modified_field_label' });
        log.debug('custscript_last_modified_field_label', last_modified_field_label);

        try {
            log.debug('savedSearchId', savedSearchId);

            // Load the saved search
            let searchObj = search.load({
                id: savedSearchId
            });

            // Retrieve the full flag from the script parameters
            var full = scriptObj.getParameter({ name: 'custscript_fly_full_flag' });
            log.debug('full', full);

            // If the full flag is false, apply a filter to the search to only include records modified after the last execution date
            if (full == false) {
                // Retrieve the flow name from the script parameters
                var flow = scriptObj.getParameter({ name: 'custscript_fly_flow' });
                log.debug('flow', flow);

                // Get the last execution date for the flow
                var lastExecutionData = getLastExecutionDate(flow);
                log.debug('lastExecutionData.date', lastExecutionData.date);
                var lastExecutionDate = (lastExecutionData !== null && lastExecutionData !== false && lastExecutionData.date !== '') ? lastExecutionData.date : new Date(0);
                log.debug('lastExecutionDate', lastExecutionDate);

                // Format the last execution date to a string
                var dateString = format.format({

                    value: lastExecutionDate,

                    type: format.Type.DATE

                });

                // Format the last execution time to a string
                var timeString = format.format({

                    value: lastExecutionDate,

                    type: format.Type.TIMEOFDAY

                });

                // Combine the date and time strings
                var dt = dateString + ' ' + timeString;
                log.debug('formatted date', dt);

                try {
                    log.debug('Adding filter for lastExecutionDate', {
                        lastExecutionDate: lastExecutionDate,
                        formattedDate: dt
                    });

                    // If a last execution date was found, add a filter to the search
                    if (lastExecutionDate) {
                        // Creating a filter to include only records modified after the last execution date
                        let newFilter = search.createFilter({
                            name: last_modified_field_label,
                            operator: search.Operator.NOTONORBEFORE,
                            values: [dt]
                        });
                        log.debug('Costruito nuovo filtro', JSON.stringify(newFilter));

                        // If the search already has filters, add the new filter with AND
                        searchObj.filters.push(newFilter);
                        log.debug('Impostato filtro', JSON.stringify(searchObj.filters));
                    } else {
                        log.debug('Nessuna lastExecutionDate trovata, salto l\'aggiunta del filtro');
                    }
                } catch (e) {
                    log.error('Error adding filter for lastExecutionDate', e.message);
                }
            }

            // Cycle through the columns and set sortdir to "NONE" if different, with many logs
            if (searchObj.columns && Array.isArray(searchObj.columns)) {
                log.debug('Number of columns in the search:', searchObj.columns.length);

                searchObj.columns.forEach(function (column, idx) {
                    log.debug('Column #' + idx, column);

                    if (column && typeof column === 'object') {
                        log.debug('Column #' + idx + ' current sortdir:', column.sort);
                        if (column.sort !== "NONE") {
                            column.sort = "NONE";
                            log.debug('Column #' + idx + ' sortdir updated to:', column.sort);
                        } else {
                            log.debug('Column #' + idx + ' sortdir already set to NONE');
                        }
                    } else {
                        log.debug('Column #' + idx + ' does not have the sortdir field or is not a valid object');
                    }
                });
            } else {
                log.debug('searchObj.columns is not an array or does not exist');
            }

            log.debug('searchObj1', searchObj);

            // Add sorting by lastmodifieddate ascending
            let columns = searchObj.columns || [];
            columns.push(
                search.createColumn({
                    name: last_modified_field_label,
                    label: 'fly_lastmodifieddate',
                    type: search.Type.DATETIME,
                    sort: search.Sort.ASC
                })
            );
            searchObj.columns = columns;

            log.debug('searchObj2', searchObj);

            // Get all results from the search
            let resultObj = getAllResults(searchObj, (el, columns) => {// Log all columns and their values for each result
                let result = {};
                columns.forEach((column, index) => {
                    let columnValue = el.getValue(column);

                    result[column.label] = columnValue;
                });

                return result;
            });

            log.debug('resultObj', JSON.stringify(resultObj));

            // Return the search results
            return resultObj;
        } catch (e) {
            log.error('Error in getInputData', e.message);
            throw e; // Throw the error if you want the script to terminate in case of error
        }
    }

    /**
     * Function to get all results from a search
     * @param {Object} baseSearch The base search object
     * @param {Function} fxResultMap The function to map the results
     * @returns {Array} The array of search results
     */
    function getAllResults(baseSearch, fxResultMap) {
        let searchResults = [];
        let start = 0;
        let partialResults = null;
        let baseSearchObj = baseSearch.run();
        let labelsMap = {};
        let columns = baseSearchObj.columns;

        // Populate the label map
        columns.forEach((element, index) => {
            labelsMap[element.label.trim()] = index;
        });

        try {
            do {
                partialResults = baseSearchObj.getRange({
                    start: start,
                    end: start + 1000
                });
                if (partialResults) {
                    partialResults.forEach((element) => {
                        if (fxResultMap) {
                            searchResults.push(fxResultMap(element, columns, labelsMap));
                        } else {
                            searchResults.push(element);
                        }
                    });
                }
                start += 1000;
            } while (partialResults && partialResults.length >= 1000);

        } catch (error) {
            // Error handling
            log.error({
                title: 'Error retrieving results',
                details: error.message
            });
            throw error;
        }

        return searchResults;
    }

    /**
     * Defines the map() function that is executed for each input key/value.  Map stage of the map/reduce process.
     * @param {Object} mapContext
     * @param {string} mapContext.key - Key to be processed during the map stage. Sets the key to the value of the input key.
     * @param {string} mapContext.value - Value to be processed during the map stage. Sets the value to the value of the input value.
     * @param {Object} mapContext.errors - Holds errors that occurred during the map stage.
     * @since 2015.2
     */
    const map = (mapContext) => {
        // log.debug('MAP Script Starts!');
        // log.debug('mapContext.Key', mapContext.key);
        // log.debug('mapContext.Value', mapContext.value);
        // Parse the value from the map context
        let mapObj = JSON.parse(mapContext.value);
        // Calculate the chunk key
        let chunkKey = parseInt(mapContext.key) / 10;
        // log.debug('chunkKey', chunkKey);
        // Get the integer part of the chunk key
        let chunkKeyInteger = Math.floor(chunkKey);
        // log.debug('chunkKeyInteger', chunkKeyInteger);
        mapContext.write({
            // key: mapContext.key,
            key: chunkKeyInteger,
            value: mapObj // Convert quantityonhand to a number
        });
    }

    /**
     * Defines the reduce() function that is executed for each input key/value.  Reduce stage of the map/reduce process.
     * @param {Object} reduceContext
     * @param {string} reduceContext.key - Key to be processed during the reduce stage. Sets the key to the value of the input key.
     * @param {Array} reduceContext.values - Array of values to be processed during the reduce stage. Each element in the array is a string.
     * @since 2015.2
     */
    function reduce(reduceContext) {
        try {
            log.debug('REDUCE Script Starts!');
            log.audit({ title: `Reduce ${reduceContext.key}`, details: 'Started' });
            log.debug('reduceContext.Value', reduceContext.values);

            log.debug('reduceContext.values.length', reduceContext.values.length);
            // Process the values from the reduce context
            processValues(reduceContext.values);
        } catch (error) {
            log.error('Error', error);
            throw error;
        }
    }

    /**
     * Processes the values from the reduce context
     * @param {Array} values The array of values to be processed
     */
    function processValues(values) {
        log.debug('REDUCE - processValue Starts!');
        try {
            // Parse the values from the reduce context
            var itemObj = values.map(item => JSON.parse(item));

            // Ordina per fly_lastmodifieddate in ordine decrescente
            itemObj.sort((a, b) => {
                return new Date(a.fly_lastmodifieddate) - new Date(b.fly_lastmodifieddate);
            });

            log.debug('itemObj', (JSON.stringify(itemObj, null, 2)));

            // Get the current script object to retrieve script parameters
            var scriptObj = runtime.getCurrentScript();
            // Retrieve the flow name from the script parameters
            var flow = scriptObj.getParameter({ name: 'custscript_fly_flow' });
            log.debug('flow', flow);

            // Get the integration configuration record for the flow
            var integrationConfig = getIntegrationConfigRecord(flow);

            // If the integration configuration is missing, log an error and return
            if (!integrationConfig || !integrationConfig.url || !integrationConfig.apiKey || !integrationConfig.flow || !integrationConfig.entityName) {
                log.error('Integration Configuration Error', 'Missing integration configuration details.');
                return;
            }

            // Retrieve the folder ID from the script parameters
            var folderId = scriptObj.getParameter({ name: 'custscript_fly_folder_id' });
            log.debug('Folder ID', folderId);

            // Retrieve the custom script path from the script parameters
            var modulePath = scriptObj.getParameter({ name: 'custscript_fly_custom_script' });
            log.debug('Custom Module Path', modulePath);

            // Define a default transformation function
            var defaultTransform = function (row) {
                return row; // Default transformation: No changes
            };

            var transformFn = defaultTransform; // Default to no transformation

            // If a custom script path is specified, load the module and set the transformation function
            if (modulePath) {
                try {
                    var functionName = 'transformRows';

                    // Load the module and set the transformation function
                    require([modulePath], function (customModule) {
                        log.debug('Custom Transform Module Loaded', 'Processing rows with custom transform.');

                        if (typeof customModule[functionName] === 'function') {
                            log.debug('Custom Function Found', 'Invoking ' + functionName);
                            transformFn = customModule[functionName];
                        } else {
                            log.error('Invalid Transform Function', 'The custom module does not export a valid ' + functionName + ' function.');
                        }

                        processExport(itemObj, transformFn, folderId, integrationConfig);
                    });
                } catch (e) {
                    log.error('Error Loading Custom Transform Module', e.message);
                    processExport(itemObj, transformFn, folderId, integrationConfig); // Use default transformation
                    return;
                }
            } else {
                log.debug('No Custom Transform Module Found', 'Processing rows with default transform.');
                processExport(itemObj, transformFn, folderId, integrationConfig);
            }
        } catch (error) {
            log.error('Error processing value: ' + error.message);
            throw error;
        }
    }

    /**
     * Processes the export of the rows
     * @param {Array} rows The array of rows to be exported
     * @param {Function} transformFn The transformation function to be used
     * @param {string} folderId The ID of the folder to save the file to
     * @param {Object} integrationConfig The integration configuration object
     */
    function processExport(rows, transformFn, folderId, integrationConfig) {
        log.debug('Total Rows Before Transformation', rows.length);
        log.debug('Rows Before Transformation', JSON.stringify(rows));

        // Generate the file name
        var fileNameBefore = 'RowsBeforeTransform_' + getCurrentDateTime() + '.json';

        // Save the file and get the content
        // Check if folderId is empty
        if (!folderId) {
            log.debug('Folder ID is empty. Skipping file saving.');
        } else {
            // Save the file and get the content
            var fileIdBefore = saveToFile(rows, fileNameBefore, folderId);
        }

        var scriptObj = runtime.getCurrentScript();

        try {
            // Transform the rows using the transformation function
            var transformedRows = transformFn(rows);

            log.debug('Total Rows After Transformation', transformedRows.length);
            log.debug('Rows After Transformation', JSON.stringify(transformedRows));

            // Generate the file name
            var fileNameAfter = 'RowsAfterTransform_' + getCurrentDateTime() + '.json';

            // Save the file and get the content
            // Save the file and get the content
            var fileId = null;
            // Check if folderId is empty
            if (!folderId) {
                log.debug('Folder ID is empty. Skipping file saving.');
            } else {
                // Save the file and get the content
                fileId = saveToFile(transformedRows, fileNameAfter, folderId);
            }

            // Export the items
            var response = exportItems(transformedRows, integrationConfig);

            // Process the response
            if (response && response.code >= 200 && response.code < 300) {
                log.debug('Success: API responded with body', response.body);

                try {
                    // Create a new custom record
                    var newRecord = record.create({
                        type: 'customrecord_fly_flow_execution', // Replace with the correct name of the custom record
                        isDynamic: true
                    });

                    // Get the value of lastmodifieddate of the last element
                    var lastLastmodifieddate = transformedRows && transformedRows.length > 0 && transformedRows[transformedRows.length - 1].fly_lastmodifieddate ?
                        transformedRows[transformedRows.length - 1].fly_lastmodifieddate : null;
                    log.debug('lastLastmodifieddate', lastLastmodifieddate);

                    // Set the values of the custom record fields
                    newRecord.setValue({ fieldId: 'name', value: integrationConfig.entityName + '_' + integrationConfig.flow + '_' + getCurrentDateTime() });
                    newRecord.setValue({ fieldId: 'custrecord_entity_name', value: integrationConfig.entityName });
                    newRecord.setValue({ fieldId: 'custrecord_flow_name', value: integrationConfig.flow });
                    newRecord.setValue({ fieldId: 'custrecord_last_execution_date', value: parseCustomDateString(lastLastmodifieddate) });
                    newRecord.setValue({ fieldId: 'custrecord_json_body', value: fileId });

                    // Save the custom record
                    var recordId = newRecord.save();
                    log.debug('Custom Record Created', 'Record ID: ' + recordId);
                } catch (e) {
                    log.error('Error creating custom record', e.message);
                }
            } else {
                log.error('Error: API did not respond with body');
            }

            log.debug('Process Export Completed', 'All rows processed and exported.');

        } catch (e) {
            log.error('Error during transformation or export: ' + e.message);
        }
    }

    /**
     * Parses a custom date string
     * @param {string} dateStr The date string to parse
     * @returns {Date} The parsed date
     */
    function parseCustomDateString(dateStr) {
        var parts = dateStr.split(' ');
        var dateParts = parts[0].split('/');
        var timeParts = parts[1].split(':');
        var hour = parseInt(timeParts[0], 10);
        var minute = parseInt(timeParts[1], 10);
        var isPM = parts[2] === 'PM';

        if (isPM && hour < 12) {
            hour += 12;
        } else if (!isPM && hour === 12) {
            hour = 0;
        }

        return new Date(
            parseInt(dateParts[2], 10),
            parseInt(dateParts[1], 10) - 1,
            parseInt(dateParts[0], 10),
            hour,
            minute
        );
    }

    /**
     * Saves data to a file
     * @param {Object} data The data to save
     * @param {string} fileName The name of the file
     * @param {string} folderId The ID of the folder to save the file to
     * @returns {string} The ID of the file
     */
    function saveToFile(data, fileName, folderId) {
        try {
            // Convert the data to a JSON string
            var jsonData = JSON.stringify(data, null, 2);
            // Create the file
            var jsonFile = file.create({
                name: fileName,
                fileType: file.Type.JSON,
                contents: jsonData,
                folder: folderId
            });

            // Save the file
            var fileId = jsonFile.save();
            log.debug('File Saved', 'File Name: ' + fileName + ', File ID: ' + fileId);

            // Return the content of the saved file
            return fileId;

        } catch (e) {
            log.error('File Save Failed', e.message);
            return false; // Returns an empty JSON in case of error
        }
    }

    /**
     * Gets the current date and time
     * @returns {string} The current date and time in ISO format
     */
    function getCurrentDateTime() {
        const formattedDate = new Date().toISOString().replace(/[^\w\s]/g, '_').slice(0, 19);
        const machineDate = new Date().getTime(); // Timestamp in millisecondi

        return formattedDate + '_' + machineDate;
    }

    /**
     * Exports items to an external system
     * @param {Object} input The input data to export
     * @param {Object} integrationConfig The integration configuration object
     * @returns {Object} The response from the external system
     */
    function exportItems(input, integrationConfig) {
        log.debug('integrationConfig.url', integrationConfig.url);
        log.debug('integrationConfig.flow', integrationConfig.flow);
        log.debug('integrationConfig.apiKey', integrationConfig.apiKey);

        log.debug('input_stringfy', JSON.stringify(input));

        // Post the data to the external system
        var response = https.post({
            url: integrationConfig.url,
            headers: {
                'Content-Type': 'application/json',
                'x-apikey': integrationConfig.apiKey
            },
            body: JSON.stringify({ 'data': input })
        });

        log.debug('response', JSON.stringify(response));

        //Simulation of a successful API response
        // var response = {
        //     code: 200,
        //     body: {
        //         success: true,
        //         message: 'Data successfully sent to external system',
        //         entityName: 'NetSuite Customer',
        //         flowName: 'Customer Sync'
        //     }
        // };

        // log.debug('Simulated response', JSON.stringify(response));

        return response;
    }

    /**
     * Gets the integration configuration record for a flow
     * @param {string} flow The name of the flow
     * @returns {Object} The integration configuration record
     */
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
     * Gets the last execution date for a flow
     * @param {string} flow The name of the flow
     * @returns {Object} The last execution date
     */
    function getLastExecutionDate(flow) {
        log.debug('Entering in getLastExecutionDate', 'getLastExecutionDate');
        try {
            // Create a search for the last execution record
            var configSearch = search.create({
                type: 'customrecord_fly_flow_execution',
                filters: [
                    ['custrecord_flow_name', 'is', flow]
                ],
                columns: [
                    search.createColumn({
                        name: 'internalid'
                    }),
                    search.createColumn({
                        name: 'custrecord_last_execution_date',
                        sort: search.Sort.DESC
                    })
                ]
            });

            // Get the results of the search
            var configResults = configSearch.run().getRange({ start: 0, end: 1 });
            // If a record is found, return the last execution date
            if (configResults.length > 0) {
                log.debug('internalid', configResults[0].getValue('internalid'));
                var internalId = configResults[0].getValue('internalid');

                var configRecord = record.load({
                    type: 'customrecord_fly_flow_execution',
                    id: internalId
                });

                return {
                    flow: configRecord.getValue({ fieldId: 'custrecord_flow_name' }),
                    entityName: configRecord.getValue({ fieldId: 'custrecord_entity_name' }),
                    date: configRecord.getValue({ fieldId: 'custrecord_last_execution_date' })
                };
            } else {
                log.error('Last Execution Record Not Found', 'No last execution record found for flow: ' + flow);
                return false;
            }
        } catch (e) {
            log.error('Error retrieving last execution record', e.message);
            return false;
        }
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce
    };
});