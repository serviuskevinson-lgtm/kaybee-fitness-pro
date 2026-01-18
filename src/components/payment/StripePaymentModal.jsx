import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// VOTRE CLÉ PUBLIQUE (pk_test_...)
const stripePromise = loadStripe("pk_test_51SqFD72dYwCmB42WZHLqUYL9eXSNjrlfTjiF3Q0ftxLYBVNvBMSkbgE4Dsaacj6ccYxJvyV2hVWpsRtLWJO97NTW00THVDqsNd");

const CheckoutForm = ({ invoice, onSuccess, onClose }) => {
    const stripe = useStripe();
    const elements = useElements();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setLoading(true);
        setError(null);

        if (!stripe || !elements) return;

        try {
            const functions = getFunctions();
            const createPayment = httpsCallable(functions, 'createPaymentIntent');

            // 1. Demander au backend de créer l'intention de paiement
            // Note: invoice.coachStripeId doit être présent dans l'objet invoice
            const { data } = await createPayment({
                amount: invoice.amount,
                invoiceId: invoice.id,
                coachStripeId: invoice.coachStripeId 
            });

            // 2. Valider le paiement avec la carte
            const result = await stripe.confirmCardPayment(data.clientSecret, {
                payment_method: {
                    card: elements.getElement(CardElement),
                    billing_details: { name: invoice.clientName },
                }
            });

            if (result.error) {
                setError(result.error.message);
            } else if (result.paymentIntent.status === 'succeeded') {
                onSuccess(); // Paiement réussi !
            }
        } catch (err) {
            console.error(err);
            setError("Une erreur est survenue.");
        }
        setLoading(false);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
            <div className="p-4 border border-gray-700 rounded-xl bg-white/5">
                <CardElement options={{
                    style: {
                        base: {
                            fontSize: '16px',
                            color: '#ffffff',
                            '::placeholder': { color: '#aab7c4' },
                        },
                        invalid: { color: '#ef4444' },
                    },
                }}/>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <Button disabled={!stripe || loading} type="submit" className="w-full bg-[#00f5d4] text-black font-bold h-12 rounded-xl">
                {loading ? "Traitement..." : `Payer ${invoice.amount}$`}
            </Button>
        </form>
    );
};

// Exemple simplifié d'un composant de paiement Client
import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import { getFunctions, httpsCallable } from 'firebase/functions';

export default function CheckoutForm({ invoice }) {
    const stripe = useStripe();
    const elements = useElements();

    const handlePay = async () => {
        // 1. Demander au backend de préparer la transaction
        const functions = getFunctions();
        const createPayment = httpsCallable(functions, 'createPaymentIntent');
        
        const { data } = await createPayment({ 
            amount: invoice.amount,
            coachStripeId: invoice.coachStripeId // Important: ID Stripe du coach (stocké dans son profil user)
        });

        // 2. Confirmer le paiement avec la carte saisie
        const result = await stripe.confirmCardPayment(data.clientSecret, {
            payment_method: {
                card: elements.getElement(CardElement),
                billing_details: { name: "Nom du Client" },
            }
        });

        if (result.error) {
            alert(result.error.message);
        } else {
            if (result.paymentIntent.status === 'succeeded') {
                alert("Paiement réussi !");
                // ICI : Mettre à jour Firestore (invoice status -> 'paid')
            }
        }
    };

    return (
        <div>
            <CardElement />
            <button onClick={handlePay}>Payer {invoice.amount}$</button>
        </div>
    );
}

export default function StripePaymentModal({ isOpen, onClose, invoice }) {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-3xl max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-black italic">Paiement Sécurisé</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <p className="text-gray-400 text-sm mb-4">Vous allez payer <span className="text-white font-bold">{invoice?.amount}$</span> pour {invoice?.description}.</p>
                    <Elements stripe={stripePromise}>
                        <CheckoutForm 
                            invoice={invoice} 
                            onClose={onClose} 
                            onSuccess={() => { alert("Merci !"); onClose(); }}
                        />
                    </Elements>
                </div>
            </DialogContent>
        </Dialog>
    );
}