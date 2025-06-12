/**
 * @NApiVersion 2.x
 * @NModuleScope Public
 */
define(['N/log', 'N/record'], function (log, record) {

    /**
     * Processes the input data to create an inventory item record in NetSuite.
     * @param {Object} row - An object containing the data for the inventory item.
     * @returns {Object} - An object indicating the success status and either the item ID or an error message.
     */
    function processData(row) {
        try {
            // Logs the input data for debugging purposes.  Helpful to see exactly what data is being passed in.
            log.debug('Input Received', JSON.stringify(row));

            // Defines an array of required fields.  The presence of these fields is validated before proceeding.
            var requiredFields = ['name', 'salesdescription', 'displayname', 'vendorname'];

            // Loops through the required fields to ensure they are present and not empty in the input data.
            for (var i = 0; i < requiredFields.length; i++) {
                var field = requiredFields[i];
                // Checks if the current required field is missing, null, or empty in the input data.
                if (row[field] === undefined || row[field] === null || row[field] === '') {
                    // Returns an error object if a required field is missing or empty, indicating failure.
                    return { success: false, error: 'Error: Missing or empty required field "' + field + '".' };
                }
            }

            // Creates a new NetSuite inventory item record.  `isDynamic: true` allows setting fields one at a time.
            var item = record.create({
                type: record.Type.INVENTORY_ITEM,
                isDynamic: true
            });

            // Sets the values for the main fields of the inventory item record.
            item.setValue({ fieldId: 'itemid', value: row.name }); // Sets the item ID (name)
            item.setValue({ fieldId: 'salesdescription', value: row.salesdescription }); // Sets the sales description

            // Modifies the displayname by adding a prefix.
            var displayName = '[TEST] ' + row.displayname;
            item.setValue({ fieldId: 'displayname', value: displayName }); // Sets the display name with the prefix

            item.setValue({ fieldId: 'vendorname', value: row.vendorname }); // Sets the vendor name

            // Saves the inventory item record to NetSuite.
            var itemId = item.save();

            // Logs the ID of the created inventory item for tracking.
            log.debug('Inventory Item Created', 'ID: ' + itemId);

            // Returns a success object with the ID of the created item.
            return { success: true, itemId: itemId };
        } catch (e) {
            // Logs any errors that occur during the process.
            log.error('Error Creating Inventory Item', e.message);

            // Returns an error object with the error message.
            return { success: false, error: e.message };
        }
    }

    // Returns an object that exposes the `processData` function.
    return {
        processData: processData
    };
});
