require('dotenv').config()

import { ScanCommand, PutCommand, DeleteCommand, GetCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb"
// const documentClient = require("./dynamodbClient");
import {documentClient} from "./dynamodbClient"
// const { table } = require('console');

import type { User, LocateEntryType, Question } from "./types"
import { table } from "console"

export async function addEntry(entry: User, tableName=process.env.DYNAMO_NAME) {

    // Add a check to see if the user is appropiately being handled here
    const response = await documentClient.send(new PutCommand({
        TableName: tableName,
        Item: entry
    }))
    return true;
}
export async function removeEntry(keyName: string, key: string, tableName=process.env.DYNAMO_NAME) {
    const response = await documentClient.send(new DeleteCommand({
        TableName: tableName,
        Key: {
            [keyName]: key
        }
    }))
    return true;
}



export async function updateEntry(keyName: string, keyValue: string, updateAttributes: any, tableName=process.env.DYNAMO_NAME): Promise<boolean> {
    // Guard against empty updateAttributes
    return new Promise(async (resolve) => {

        if (Object.keys(updateAttributes).length === 0) {
            throw new Error("updateAttributes cannot be empty");
            resolve(false)
        }
    
        let updateExpression = "SET ";
        const expressionAttributeValues = {};
        const expressionAttributeNames = {};
    
        Object.entries(updateAttributes).forEach(([attr, value], index) => {
            if (index > 0) updateExpression += ", ";
            updateExpression += `#${attr} = :${attr}`;
            expressionAttributeValues[`:${attr}`] = value;
            expressionAttributeNames[`#${attr}`] = attr;
        });
    
        const response = await documentClient.send(new UpdateCommand({
            TableName: tableName,
            Key: { [keyName]: keyValue },
            UpdateExpression: updateExpression, // <-- Fixed uppercase 'U'
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: "UPDATED_NEW"
        }));

        resolve(true);



    })
    

    // return response.Attributes || true;
}


export async function queryEntries(keyName: string, value: string, sortKey: string, sortValue: string | number, tableName=process.env.DYNAMO_NAME): Promise<any> {
    return new Promise(async(resolve) => {  


        // this could won't work for the main database.
        const response = await documentClient.send(new QueryCommand({
            TableName: tableName,
            IndexName: keyName+'-index',
            KeyConditionExpression: `${keyName} = :pkValue AND ${sortKey} = :skValue`,
            ExpressionAttributeValues: {
                ":pkValue": value.trim(),
                ":skValue": sortValue// e.g., 4
            },
            // lets make the optional for now. this could maybe change later.
            // Limit: limit,    
        }));


        resolve(response.Items);


    })


}


export async function locateEntry(keyName:string, value: string, tableName=process.env.DYNAMO_NAME, limit:number=1000) : LocateEntryType {
    return new Promise(async(resolve) => {

        console.log("first if statement", keyName.toLowerCase() === process.env.PARTITION_KEY?.toLowerCase());
        console.log("second if statement", process.env.SECOND_PARTITION_KEY?.toLowerCase())

        if (((keyName.toLowerCase() === process.env.PARTITION_KEY?.toLowerCase()) || (keyName.toLowerCase() === process.env.SECOND_PARTITION_KEY?.toLowerCase()))) {
            const response = await documentClient.send(new GetCommand({
                TableName: tableName,
                Key: {
                    [keyName]: value, 
                }
            }))
            // console.log(response);


            

            resolve((response.Item as User) || "")
        } else {

            const response = await documentClient.send(new QueryCommand({
                TableName: tableName,
                IndexName: keyName+"-index",
                KeyConditionExpression: `${keyName} = :value`,
                ExpressionAttributeValues: {
                    ":value": value.trim()
                },
                Limit: limit,
            }));

            resolve(response.Items as User[] || "")
        }
        
        
        
      
        
    })
    // this could be different keys


    
}


