import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreditCard, CheckCircle } from 'lucide-react';

// TA CLÉ PUBLIQUE STRIPE (pk_test_...)
const stripePromise = loadStripe("pk_test_XXXXXXXXXXXXXXXXXXXXXXXX");

// Formulaire de Carte Bancaire (Sous-composant)
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
            // 1. Récupérer l'ID Stripe du coach (nécessaire pour le virement)
            const coachDoc = await getDoc(doc(db, "users", invoice.coachId));
            const coachStripeId = coachDoc.data()?.stripeAccountId;

            if (!coachStripeId) throw new Error("Ce coach n'a pas encore configuré ses paiements.");

            // 2. Appeler le Cloud Function
            const functions = getFunctions();
            const createPayment = httpsCallable(functions, 'createPaymentIntent');
            const { data } = await createPayment({
                amount: invoice.amount,
                coachStripeId: coachStripeId // C'est grâce à ça que le split 95/5 se fait
            });

            // 3. Valider le paiement
            const result = await stripe.confirmCardPayment(data.clientSecret, {
                payment_method: {
                    card: elements.getElement(CardElement),
                    billing_details: { name: invoice.clientName },
                }
            });

            if (result.error) {
                setError(result.error.message);
            } else if (result.paymentIntent.status === 'succeeded') {
                // 4. Mettre à jour Firestore
                await updateDoc(doc(db, "invoices", invoice.id), {
                    status: 'paid',
                    paidAt: new Date().toISOString()
                });
                onSuccess();
            }
        } catch (err) {
            console.error(err);
            setError(err.message || "Paiement échoué.");
        }
        setLoading(false);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="p-4 border border-gray-700 rounded-xl bg-white/5">
                <CardElement options={{
                    style: { base: { fontSize: '16px', color: '#fff', '::placeholder': { color: '#aab7c4' } } }
                }}/>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <Button disabled={!stripe || loading} type="submit" className="w-full bg-[#00f5d4] text-black font-bold h-12 rounded-xl">
                {loading ? "Traitement..." : `Payer ${invoice.amount}$`}
            </Button>
        </form>
    );
};

// Composant Principal à afficher dans le Dashboard Client
export default function ClientBilling() {
    const { currentUser } = useAuth();
    const [invoices, setInvoices] = useState([]);
    const [selectedInvoice, setSelectedInvoice] = useState(null);

    useEffect(() => {
        const fetchInvoices = async () => {
            if (!currentUser) return;
            // On cherche les factures envoyées À ce client
            const q = query(
                collection(db, "invoices"), 
                where("clientId", "==", currentUser.uid),
                where("status", "==", "pending") // Seulement les impayées
            );
            const snap = await getDocs(q);
            setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        };
        fetchInvoices();
    }, [currentUser]);

    return (
        <div className="space-y-4">
            <h3 className="text-white font-bold flex items-center gap-2"><CreditCard className="text-[#00f5d4]"/> Factures à payer</h3>
            
            {invoices.length === 0 ? (
                <p className="text-gray-500 text-sm italic">Aucune facture en attente.</p>
            ) : (
                invoices.map(inv => (
                    <Card key={inv.id} className="bg-[#1a1a20] border-gray-800">
                        <CardContent className="p-4 flex justify-between items-center">
                            <div>
                                <p className="text-white font-bold">{inv.description}</p>
                                <p className="text-gray-500 text-xs">Date: {new Date(inv.createdAt?.seconds * 1000).toLocaleDateString()}</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-white font-black text-lg">{inv.amount}$</span>
                                <Button onClick={() => setSelectedInvoice(inv)} size="sm" className="bg-[#00f5d4] text-black font-bold">Payer</Button>
                            </div>
                        </CardContent>
                    </Card>
                ))
            )}

            {/* MODAL DE PAIEMENT */}
            <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
                <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-3xl">
                    <DialogHeader>
                        <DialogTitle>Paiement Sécurisé</DialogTitle>
                    </DialogHeader>
                    {selectedInvoice && (
                        <Elements stripe={stripePromise}>
                            <CheckoutForm 
                                invoice={selectedInvoice} 
                                onSuccess={() => {
                                    alert("Paiement réussi !");
                                    setSelectedInvoice(null);
                                    window.location.reload(); // Pour rafraîchir la liste
                                }}
                                onClose={() => setSelectedInvoice(null)}
                            />
                        </Elements>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}