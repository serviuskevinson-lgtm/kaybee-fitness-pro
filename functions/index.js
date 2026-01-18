// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');

// On utilise la variable d'environnement pour la sécurité
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

admin.initializeApp();

// 1. ONBOARDING : Créer un compte Stripe pour le Coach
exports.createConnectedAccount = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Non connecté');
    
    const uid = context.auth.uid;
    
    // Création du compte Express pour le coach
    const account = await stripe.accounts.create({
        type: 'express',
        country: 'CA', // Assure-toi que c'est le bon code pays
        email: context.auth.token.email,
        capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
        },
    });

    // Sauvegarder l'ID Stripe du coach dans Firestore
    await admin.firestore().collection('users').doc(uid).update({
        stripeAccountId: account.id
    });

    // IMPORTANT : Remplace ces URLs par ton vrai domaine une fois en ligne (ex: https://mon-app.vercel.app/dashboard)
    const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: 'https://kaybeefitness.com/dashboard', // URL si échec/retour
        return_url: 'https://kaybeefitness.com/dashboard',  // URL succès
        type: 'account_onboarding',
    });

    return { url: accountLink.url };
});

// 2. PAIEMENT : Préparer la transaction (Client -> Coach + Plateforme)
exports.createPaymentIntent = functions.https.onCall(async (data, context) => {
    // data attendu: { amount: 100, invoiceId: 'abc...', coachStripeId: 'acct_...' }
    
    const amountInCents = Math.round(data.amount * 100);
    const feeInCents = Math.round(amountInCents * 0.05); // 5% pour vous

    const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: 'cad',
        payment_method_types: ['card'],
        application_fee_amount: feeInCents, // VOTRE COMMISSION
        transfer_data: {
            destination: data.coachStripeId, // LE RESTE VA AU COACH
        },
        metadata: {
            invoiceId: data.invoiceId // Pour retrouver la facture dans le Webhook
        }
    });

    return { clientSecret: paymentIntent.client_secret };
});

// 3. WEBHOOK : Écouter la confirmation de paiement
// Correction ici : (req, res) au lieu de (req, req)
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
    const sig = req.headers['stripe-signature'];
    
    // Utilise aussi une variable d'environnement pour ça, ou remets ta clé 'whsec_...' si tu testes en local
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET; 

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
    } catch (err) {
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Gestion de l'événement "Paiement Réussi"
    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const invoiceId = paymentIntent.metadata.invoiceId;

        if (invoiceId) {
            try {
                // Mise à jour automatique de Firestore
                await admin.firestore().collection('invoices').doc(invoiceId).update({
                    status: 'paid',
                    paidAt: admin.firestore.FieldValue.serverTimestamp(),
                    stripePaymentId: paymentIntent.id
                });
                console.log(`Facture ${invoiceId} payée !`);
            } catch (error) {
                console.error("Erreur mise à jour Firestore", error);
            }
        }
    }

    res.json({received: true});
});