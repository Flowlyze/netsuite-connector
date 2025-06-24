# Introduction 
The "Netsuite Connector" consists in a set of Netsuite SuiteScripts which are thought to Speed-Up the integration between Netsuite and third-party applications (e.g. Shopify, Pimcore, etc.) leveraging the potentials of Flowlyze as system integrator.

# Installation and Setup
In order to correclty install the connector in Netsuite, you must follow these few steps:

#### Upload SuiteScripts in FileCabinet
You must install all the scripts that you find in the "src\FileCabinet\SuiteScripts" folder on this repo. Please note that:

- Both Import and Export flows have a "samples" subfolder that you may not copy in your Netsuite instance

- You can place the scripts where you want in your FileCabinet, folder structure is not mandatory

#### Create Custom Records
To let the scripts works properly, you must create a couple of Custom Record in your Netsuite Instance

###### [FLY] Flowlyze Integration
Create a Custom Record named "<b>[FLY] Flowlyze Integration</b>", which id must be "*customrecord_fly_flowlyze_integration*".

The Custom Record fields must be the following

![[FLY] Flowlyze Integration Record fields](docs/img/customrecord_fly_flowlyze_integration_fields.png)

To be more specific, we'll give an explaination for each field:
- <b>URL</b>: the URL of the Flowlyze flow
- <b>API Key</b>: the API Key you have configure to authenticate to the the Flowlyze flow
- <b>Flow Name</b>: a free name you want to associate to the flow in Netsuite
- <b>Entity Name</b>: name of the Netsuite involved kind of entity (e.g. SalesOrder, InventoryItem)

###### [FLY] Flow Execution
Create a Custom Record named "<b>[FLY] Flow Execution</b>", which id must be "*customrecord_fly_flow_execution*".

The Custom Record fields must be the following

![[FLY] Flow Execution Record fields](docs/img/customrecord_fly_flow_execution_fields.png)

This record instances are created by the export flow to keep trace of the executed exports.

# Flows Configuration
To properly configure import and export flows in Netsuite, you must prior configure destinations and flows in Flowlyze. To see how configure them, have a look at the [Flowlyze documentation](https://ipaas-doc.vercel.app/docs/intro).

#### Export to Flowlyze
Every export flow is based on a saved search.

The SuiteScript takes the search in input and use that to dynamically compose the messages to be sent to Flowlyze, using a naming convention on the saved serach column names.

If needed, you can develop a custom script to pass as a parameter to the main script to transform each row before sending messages to Flowlyze.

For more details, please have a look at the [Export from NetSuite to Flowlyze](docs/Export%20from%20NetSuite%20to%20Flowlyze.md) page on the docs

#### Import from Flowlyze
For import flows, we provide the main script which takes care to connect to Flowlyze to import messages and give back the acknowledgement of properly read messages.

To elaborate each message, and effectively create or update records in Netsuite, you must develop a custom script with your own business logic to pass as a parameter to the main script.

For more details, please have a look at the [Import from Flowlyze to NetSuite](docs/Import%20from%20Flowlyze%20to%20NetSuite.md)
