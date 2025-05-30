/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */
define(['N/search', 'N/record'],
    (search, record) => {
        const execute = (context) => {
            try {
                // Search for all customrecord_fly_flow_execution records
                search.create({
                    type: 'customrecord_fly_flow_execution',
                    filters: [],
                    columns: ['internalid']
                }).run().each(result => {
                    try {
                        // Delete the record
                        record.delete({
                            type: 'customrecord_fly_flow_execution',
                            id: result.id
                        });
                        log.debug({
                            title: 'Record Deleted',
                            details: 'Record ID: ' + result.id
                        });
                    } catch (deleteError) {
                        log.error({
                            title: 'Error Deleting Record',
                            details: 'Record ID: ' + result.id + ', Error: ' + deleteError
                        });
                    }
                    return true; // Continue the search
                });
            } catch (searchError) {
                log.error({
                    title: 'Error Searching Records',
                    details: searchError
                });
            }
        }

        return {
            execute: execute
        };
    });