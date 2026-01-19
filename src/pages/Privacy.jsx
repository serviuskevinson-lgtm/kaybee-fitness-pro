import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-4 lg:p-8">
      <div className="max-w-4xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
            <Link to="/">
                <Button variant="ghost" className="text-white hover:text-[#00f5d4]">
                    <ArrowLeft className="mr-2" /> Retour
                </Button>
            </Link>
            <h1 className="text-3xl font-black italic uppercase text-white">Politique de Confidentialité</h1>
        </div>

        <Card className="bg-[#1a1a20] border-gray-800">
            <CardContent className="p-6 space-y-6 text-gray-300 text-sm leading-relaxed">
                
                <section>
                    <h2 className="text-xl font-bold text-white mb-2">1. Introduction</h2>
                    <p>Bienvenue sur Kaybee Fitness ("l'Application"). Nous prenons la confidentialité de vos données très au sérieux. Cette politique de confidentialité explique comment nous recueillons, utilisons, divulguons et protégeons vos informations lorsque vous utilisez notre application mobile et notre site web.</p>
                </section>

                <section>
                    <h2 className="text-xl font-bold text-white mb-2">2. Données collectées</h2>
                    <p>Pour fournir nos services de coaching et de suivi, nous pouvons collecter les types de données suivants :</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li><strong>Informations personnelles :</strong> Nom, adresse email, photo de profil (via l'authentification).</li>
                        <li><strong>Données de santé et fitness :</strong> Poids, taille, historique d'entraînement, plans nutritionnels, progression physique.</li>
                        <li><strong>Contenu utilisateur :</strong> Photos et vidéos téléchargées dans la galerie pour le suivi ou la comparaison (Posing, repas, physique).</li>
                        <li><strong>Données techniques :</strong> Logs de connexion, type d'appareil (pour l'optimisation de l'affichage).</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-xl font-bold text-white mb-2">3. Utilisation des données</h2>
                    <p>Vos données sont utilisées uniquement pour :</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>Créer et gérer votre compte personnel.</li>
                        <li>Vous fournir des programmes d'entraînement et de nutrition personnalisés.</li>
                        <li>Permettre le suivi de votre progression (graphiques, photos).</li>
                        <li>Faciliter la communication avec votre coach (le cas échéant).</li>
                        <li>Améliorer les fonctionnalités de l'application.</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-xl font-bold text-white mb-2">4. Partage des données</h2>
                    <p>Nous ne vendons jamais vos données personnelles.</p>
                    <p>Vos informations peuvent être partagées uniquement :</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>Avec votre <strong>Coach</strong> attitré (si vous utilisez le mode suivi) pour qu'il puisse analyser votre progression.</li>
                        <li>Avec nos fournisseurs de services tiers nécessaires au fonctionnement de l'app (ex: Google Firebase pour l'hébergement et l'authentification).</li>
                        <li>Si la loi l'exige.</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-xl font-bold text-white mb-2">5. Sécurité</h2>
                    <p>Nous utilisons des mesures de sécurité conformes aux normes de l'industrie (telles que le chiffrement SSL via Google Firebase) pour protéger vos données contre l'accès non autorisé, la modification ou la suppression.</p>
                </section>

                <section>
                    <h2 className="text-xl font-bold text-white mb-2">6. Vos droits (Suppression des données)</h2>
                    <p>Vous avez le droit d'accéder à vos données, de les corriger ou de demander leur suppression totale.</p>
                    <p>Si vous souhaitez supprimer votre compte et toutes les données associées (historique, photos, messages), vous pouvez le faire directement depuis les paramètres de l'application ou en nous contactant à l'adresse ci-dessous.</p>
                </section>

                <section>
                    <h2 className="text-xl font-bold text-white mb-2">7. Contact</h2>
                    <p>Pour toute question concernant cette politique de confidentialité, veuillez nous contacter à :</p>
                    <p className="mt-2 font-bold text-[#00f5d4]">[info@kaybeefitness.com]</p> 
                </section>

            </CardContent>
        </Card>
        
        <div className="text-center text-gray-600 text-xs mt-8">
            Dernière mise à jour : {new Date().toLocaleDateString()}
        </div>

      </div>
    </div>
  );
}