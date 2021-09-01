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

function generateChannelId(communicationToken: string, userId?: ObjectId): string {
    return communicationToken + "_" + (userId ? new ObjectId(userId).toHexString() : "")
}

function addMSToTime(date: Date, extraMS: number): Date {
    const newDate = date;
    newDate.setMilliseconds(newDate.getMilliseconds() + extraMS)
    return newDate;
}

function getLastStatus(myTicket?: TicketDbObject): TicketStatusDbObject {
    return myTicket?.statuses.reduce((latest, current) => compareDates(current.timestamp, latest.timestamp) > 0 ? current : latest) ?? {
        statusCode: TicketStatusCode.Initialized,
        timestamp: new Date(),
        queuePosition: null
    };
}

function getLastQueuePosition(tickets: TicketDbObject[] | undefined = []): number {
    return tickets.reduce<number>((lastPosition, ticket) => {
        const { queuePosition } = getLastStatus(ticket);
        const processedQueuePosition = queuePosition ?? 0;
        return lastPosition > processedQueuePosition ? lastPosition : processedQueuePosition;
    }, 0) ?? 0;
}

export { customTryCatch, compareDates, generateChannelId, getLastStatus, getLastQueuePosition, addMSToTime }