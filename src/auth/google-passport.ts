import express from "express";
import { getLoadedEnvVariables } from "../utils/env-loader";
import { UserDbObject } from "allotr-graphql-schema-types";
import { ObjectId } from "mongodb"

import passport from "passport";
import session from "express-session";
import MongoStore from 'connect-mongo';
import { USERS } from "../consts/collections";
import { getMongoDBConnection } from "../utils/mongodb-connector";

const cors = require('cors');

function isLoggedIn(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (req.user) {
        next();
    } else {
        res.sendStatus(401);
    }
}

// Initialize passport data
const { MONGO_DB_ENDPOINT, SESSION_SECRET } = getLoadedEnvVariables();

const sessionMiddleware = session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { domain: '.allotr.eu', maxAge: 30 * 24 * 60 * 60 * 1000 },
    store: new MongoStore({ mongoUrl: MONGO_DB_ENDPOINT }),
})

const passportMiddleware = passport.initialize();
const passportSessionMiddleware = passport.session();


function initializeGooglePassport(app: express.Express) {
    const { REDIRECT_URL } = getLoadedEnvVariables();
    const corsOptions = {
        origin: REDIRECT_URL,
        credentials: true // <-- REQUIRED backend setting
    };
    app.use(cors(corsOptions));

    app.use(sessionMiddleware)
    app.use(passportMiddleware)
    app.use(passportSessionMiddleware)

    passport.serializeUser<ObjectId>((user: any, done) => {
        done(null, user._id);
    });

    passport.deserializeUser<ObjectId>(async (id, done) => {
        try {
            const db = await (await getMongoDBConnection()).db;
            const idToSearch = new ObjectId(id);
            const user = await db.collection<UserDbObject>(USERS).findOne({ _id: idToSearch });
            done(null, user);
        } catch (e) {
            console.log("error deserializing user", e);
        }
    });

}
export { initializeGooglePassport, isLoggedIn, sessionMiddleware, passportMiddleware, passportSessionMiddleware }