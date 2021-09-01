
import express from "express";

import { EnvLoader } from "../utils/env-loader";

import { isLoggedIn } from "../auth/google-passport";
import { ObjectId } from "mongodb";
import * as webPush from "web-push"

// Web Push
// API
const { IS_HTTPS, HTTPS_PORT, WS_PATH, VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, REDIRECT_URL } = EnvLoader.getInstance().loadedVariables;

function initializeWebPush(app: express.Express) {

    webPush.setVapidDetails(
        REDIRECT_URL,
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    );

    // Global array collecting all active endpoints. In real world
    // application one would use a database here.
    const subscriptions: any = {};

    const retryMap: any = {};

    // How often (in seconds) should the server send a notification to the
    // user.
    const pushInterval = 5;

    // Send notification to the push service. Remove the subscription from the
    // `subscriptions` array if the  push service responds with an error.
    // Subscription has been cancelled or expired.
    function sendNotification(subscription: any) {
        console.log("Sending notification...")
        webPush.sendNotification(subscription)
            .then(function () {
                console.log('Push Application Server - Notification sent to ' + subscription.endpoint);
            }).catch(function () {
                console.log('ERROR in sending Notification, retrying in ' + pushInterval + 's: ' + subscription.endpoint);
                retryMap[subscription.endpoint] = !retryMap[subscription.endpoint] ? 0 : retryMap[subscription.endpoint];
                retryMap[subscription.endpoint]++;
                if (retryMap[subscription.endpoint] >= 3) {
                    delete subscriptions[subscription.endpoint];
                    console.log("Failed many times: endpoint removed " + subscription.endpoint);
                }
            });
    }

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.get('/webpush/vapidPublicKey', isLoggedIn, (req, res) => {
        res.send(VAPID_PUBLIC_KEY);
    });

    // Register a subscription by adding it to the `subscriptions` array.
    app.post('/webpush/register', isLoggedIn, (req, res) => {
        console.log("req", req.body);
        var subscription = req?.body?.subscription;
        if (!subscriptions[subscription.endpoint]) {
            console.log('Subscription registered ' + subscription.endpoint);
            subscriptions[subscription.endpoint] = subscription;
        }
        res.sendStatus(201);
    });

    // Unregister a subscription by removing it from the `subscriptions` array
    app.post('/webpush/unregister', isLoggedIn, (req, res) => {
        var subscription = req?.body?.subscription;
        if (subscriptions[subscription.endpoint]) {
            console.log('Subscription unregistered ' + subscription.endpoint);
            delete subscriptions[subscription.endpoint];
        }
        res.sendStatus(201);
    });


    // In real world application is sent only if an event occured.
    // To simulate it, server is sending a notification every `pushInterval` seconds
    // to each registered endpoint.
    setInterval(() => {
        // console.log("Subscriptions active", subscriptions);
        Object.values(subscriptions).forEach(sendNotification);
    }, pushInterval * 1000);

}



export { initializeWebPush }