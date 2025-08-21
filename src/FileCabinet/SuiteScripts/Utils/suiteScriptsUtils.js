/**
 * suiteScriptsUtils.js
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/search', 'N/file', 'N/log'], (search, file, log) => {
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

    function formatDateToDDMMYYYY(dateString) {
        // Esempio: "2025-06-23T07:28:42+00:00"
        if (!dateString) return null;

        // If dateString is a Date object, convert it to ISO string
        if (Object.prototype.toString.call(dateString) === '[object Date]') {
            dateString = dateString.toISOString();
        }

        // Prende solo la parte data e ora, ignora il timezone
        if (typeof dateString !== 'string') return null;
        const dateTimeParts = dateString.split('T');
        if (dateTimeParts.length < 2) return null;

        const dateParts = dateTimeParts[0].split('-');
        const timeParts = dateTimeParts[1].split(':');

        const year = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1; // JS months are 0-based
        const day = parseInt(dateParts[2], 10);

        const hour = parseInt(timeParts[0], 10);
        const minute = parseInt(timeParts[1], 10);

        return new Date(year, month, day, hour, minute);
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

    function preProcessRows(rows){
        var preProcessedRows = [];

        log.debug('preProcessRows', 'Starting transformation for ' + (Array.isArray(rows) ? rows.length : 0) + ' rows');

        if (!Array.isArray(rows)) {
            log.error('Invalid Input', 'Rows is not an array. Received type: ' + typeof rows);
            return [];
        }

        rows.forEach(function (row, index) {
            try {
                log.debug('Processing Row', 'Index: ' + index + ', Row: ' + JSON.stringify(row));

                const processedRow = {};
                processedRow.tags = [];

                Object.keys(row).forEach(function (key) {
                    const value = row[key].replace("\n","\\n");

                    if (key && key.includes('|')) {
                        const parts = key.split('|');

                        if (parts[0] === 'tags') {
                            if (value !== null && value !== undefined && value !== '') {
                                processedRow.tags.push(value);
                            }
                        } else {
                            var ref = processedRow;
                            for (var i = 0; i < parts.length - 1; i++) {
                                if (!ref[parts[i]]) {
                                    ref[parts[i]] = {};
                                }
                                ref = ref[parts[i]];
                            }
                            ref[parts[parts.length - 1]] = value;
                        }
                    } else if (key) {
                        processedRow[key] = value;
                    }
                });

                preProcessedRows.push(processedRow);

                log.debug('Row Processed', 'Index: ' + index);
            } catch (error) {
                log.error('Error Processing Row ' + index, error.message);
            }
        });

        log.debug('preProcessRows', 'Transformation complete. Filtered rows count: ' + preProcessedRows.length);

        return preProcessedRows;
    }

    return { getAllResults, formatDateToDDMMYYYY, parseCustomDateString, saveToFile, getCurrentDateTime, getIntegrationConfigRecord, preProcessRows };
});
