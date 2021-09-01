import { Resolvers, OperationResult, ResourceDbObject, UserDbObject, LocalRole, TicketStatusCode, ErrorCode, User, ResourceCard, Ticket } from "allotr-graphql-schema-types";
import { MongoDBSingleton } from "../utils/mongodb-singleton";
import { ObjectId, ClientSession, Db } from "mongodb";
import { getLastStatus } from "../utils/data-util";
import { VALID_STATUES_MAP } from "../consts/valid-statuses-map";
import { getUserTicket } from "../utils/resolver-utils";


async function canRequestStatusChange(userId: string | ObjectId, resourceId: string, targetStatus: TicketStatusCode, session: ClientSession, myDb?: Db): Promise<{
    canRequest: boolean,
    ticketId?: ObjectId | null,
    activeUserCount?: number,
    maxActiveTickets?: number,
    queuePosition?: number | null
}> {
    const resource = await getUserTicket(userId, resourceId, myDb);
    const ticket = resource?.tickets?.[0];
    const { statusCode, queuePosition } = getLastStatus(ticket);
console.log(resource, ticket?.statuses, statusCode, VALID_STATUES_MAP[statusCode as TicketStatusCode].includes(targetStatus) )
    return {
        canRequest: resource != null && VALID_STATUES_MAP[statusCode as TicketStatusCode].includes(targetStatus),
        ticketId: ticket?._id,
        activeUserCount: resource?.activeUserCount,
        maxActiveTickets: resource?.maxActiveTickets,
        queuePosition
    }

}

async function hasUserAccessInResource(userId: string | ObjectId, resourceId: string): Promise<boolean> {
    const resource = await getUserTicket(userId, resourceId);
    return resource?.tickets?.[0]?.user?.role === LocalRole.ResourceUser;
}

async function hasAdminAccessInResource(userId: string | ObjectId, resourceId: string): Promise<boolean> {
    const resource = await getUserTicket(userId, resourceId);
    return resource?.tickets?.[0]?.user?.role === LocalRole.ResourceUser;
}



export { hasUserAccessInResource, hasAdminAccessInResource, canRequestStatusChange }