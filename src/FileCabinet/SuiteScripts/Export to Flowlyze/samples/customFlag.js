/**
 * @NApiVersion 2.x
 * @NModuleScope Public
 */
define(['N/log', 'N/file'], function(log, file) {

  /**
   * Transforms an array of rows based on a specific condition 
   * @param {Array<object>} rows - An array of objects, where each object represents a row of data.
   * @param {string} folderId - The internal ID of the folder in NetSuite where the files will be saved.
   * @returns {Array<object>} An array containing only the rows that meet the transformation criteria.
   */
  function transformRows(rows, folderId) {
    // Initial log to verify what is being passed
    log.debug('Input Rows Type', typeof rows);
    log.debug('Input Rows Content', JSON.stringify(rows));

    // Check that rows is a valid array
    if (!Array.isArray(rows)) {
      log.error('Invalid Input', 'Rows is not an array. Received type: ' + typeof rows);
      return [];
    }

    var filteredRows = rows.filter(function(row, index) {
      log.debug('Processing Row ' + index, JSON.stringify(row));

      try {
        // Parsing and validation of the 'amount' field
        var amount = parseFloat(row.amount);
        log.debug('Row ' + index + ' amount value', amount); // Log the value of amount

        if (!isNaN(amount) && amount > 1000) {
          row.isAvailable = true;
            row.flag = "Greater than 1000";
          log.debug('Row ' + index + ' transformed', JSON.stringify(row));
          return true; // Keep this row
        } else {
          log.debug('Row ' + index + ' excluded', 'Amount does not meet condition');
          return false; // Exclude this row
        }
      } catch (error) {
        log.error('Error Processing Row ' + index, error.message);
        return false; // Exclude this row in case of error
      }
    });

    log.debug('Transformation Result', JSON.stringify(filteredRows));

    return filteredRows;
  }

  return {
    transformRows: transformRows
  };
});
