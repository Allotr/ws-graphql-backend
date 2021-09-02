import { CustomTryCatch } from "../types/custom-try-catch";
import { TicketDbObject, TicketStatusCode, TicketStatusDbObject } from "allotr-graphql-schema-types";
import { ObjectId } from "mongodb";

async function customTryCatch<T>(promise: Promise<T>): Promise<CustomTryCatch<T>> {
    try {
        const result = await promise;
        return { result, error: null }
    } catch (error) {
        return { result: null, error }
    }
}

function compareDates(dateA: Date, dateB: Date) {
    const comparison = new Date(dateA).getTime() - new Date(dateB).getTime();
    if (comparison > 0)
        return 1;
    if (comparison < 0)
        return -1;
    return 0;
}

function generateChannelId(communicationToken: string, userId?: ObjectId | null): string {
    return communicationToken + "_" + (userId ? new ObjectId(userId).toHexString() : "")
}


export { customTryCatch, compareDates, generateChannelId }