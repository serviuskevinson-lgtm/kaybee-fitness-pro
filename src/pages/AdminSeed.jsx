import React, { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, writeBatch } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Upload, Database, FileText, AlertTriangle } from 'lucide-react';
import Papa from 'papaparse';

export default function AdminSeed() {
  const [csvFile, setCsvFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  
  // CONFIGURATION DU STORAGE
  // IMPORTANT : Assurez-vous que c'est le bon ID de projet
  const PROJECT_ID = "kaybee-fitness"; 
  const BUCKET_URL = `https://firebasestorage.googleapis.com/v0/b/${PROJECT_ID}.firebasestorage.app/o/meals%2F`;
  const [imageExtension, setImageExtension] = useState(".jpg");

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setCsvFile(e.target.files[0]);
      addLog(`Fichier chargé : ${e.target.files[0].name}`);
    }
  };

  const addLog = (msg) => setLogs(prev => [`> ${msg}`, ...prev]);

  // --- FONCTION INTELLIGENTE POUR TROUVER LES DONNÉES ---
  // Cherche la clé peu importe la casse (ex: trouve 'fat' même si on demande 'Fat')
  const smartGet = (row, keyName) => {
    const keys = Object.keys(row);
    // 1. Cherche correspondance exacte
    if (row[keyName] !== undefined) return row[keyName];
    // 2. Cherche correspondance minuscule/majuscule
    const foundKey = keys.find(k => k.toLowerCase().trim() === keyName.toLowerCase().trim());
    if (foundKey) return row[foundKey];
    return null;
  };

  const processCSV = () => {
    if (!csvFile) return;
    setLoading(true);
    setProgress(0);

    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        addLog(`Analyse CSV terminée : ${results.data.length} lignes trouvées.`);
        
        // Debug: Afficher les colonnes trouvées dans la première ligne
        if (results.data.length > 0) {
            console.log("Colonnes détectées:", Object.keys(results.data[0]));
            addLog(`Colonnes détectées : ${Object.keys(results.data[0]).join(', ')}`);
        }

        await uploadToFirestore(results.data);
      },
      error: (err) => {
        addLog(`Erreur lecture CSV: ${err.message}`);
        setLoading(false);
      }
    });
  };

  const uploadToFirestore = async (data) => {
    const batchSize = 400; 
    let batches = [];
    let currentBatch = writeBatch(db);
    let operationCount = 0;
    let successCount = 0;

    addLog("Démarrage de l'envoi vers Firebase...");

    data.forEach((row, index) => {
      // Ignore les lignes vides
      if (!smartGet(row, 'Name')) return;

      // 1. NETTOYAGE & RÉCUPÉRATION INTELLIGENTE
      const mealId = smartGet(row, 'Unnamed: 0') || smartGet(row, 'id') || `meal_${Date.now()}_${index}`;
      
      // Récupération sécurisée des chiffres (évite les NaN/0)
      const getInt = (key) => {
          const val = smartGet(row, key);
          // Enlève les unités si présentes (ex: "350 kcal" -> 350)
          const cleanVal = val ? val.toString().replace(/[^0-9.]/g, '') : "0";
          return parseInt(cleanVal) || 0;
      };

      const imageUrl = `${BUCKET_URL}${mealId}${imageExtension}?alt=media`;

      const mealData = {
        id: mealId,
        name: smartGet(row, 'Name'),
        type: smartGet(row, 'Type') || "Autre", // Dinner, Déjeuner...
        imageUrl: imageUrl, 
        
        // Utilisation de la fonction getInt pour éviter les 0
        calories: getInt('Calories'),
        protein: getInt('Protein'),
        carbs: getInt('Carbs'),
        fat: getInt('fat'), // Cherche 'fat' ou 'Fat'
        
        prepTime: smartGet(row, 'Prep time') || "15 min",
        ingredients: smartGet(row, 'ingredients') ? smartGet(row, 'ingredients').split(',').map(i => i.trim()) : [],
        instructions: smartGet(row, 'Instructions') || "",
        description: smartGet(row, 'Vortex_Prompt') || "",
        createdAt: new Date().toISOString()
      };

      // Vérification console pour le premier item
      if (index === 0) {
          console.log("Exemple de données traitées :", mealData);
          addLog(`Test lecture : ${mealData.name} -> ${mealData.calories} Kcal (Si 0, vérifiez les colonnes)`);
      }

      // 2. PRÉPARATION DU BATCH
      const docRef = doc(db, "meals", mealId); 
      currentBatch.set(docRef, mealData);
      operationCount++;
      successCount++;

      if (operationCount >= batchSize) {
        batches.push(currentBatch);
        currentBatch = writeBatch(db);
        operationCount = 0;
      }
    });

    if (operationCount > 0) batches.push(currentBatch);

    // 3. ENVOI
    try {
      for (let i = 0; i < batches.length; i++) {
        await batches[i].commit();
        const percent = Math.round(((i + 1) / batches.length) * 100);
        setProgress(percent);
        addLog(`Lot ${i + 1}/${batches.length} sauvegardé.`);
      }
      addLog(`✅ SUCCÈS : ${successCount} repas importés dans la base de données !`);
      addLog("👉 Retournez sur la page 'Repas' pour voir le résultat.");
    } catch (error) {
      console.error(error);
      addLog(`❌ ERREUR FIREBASE : ${error.message}`);
      addLog("Conseil : Vérifiez vos règles de sécurité Firestore (Rules).");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        <div className="flex items-center gap-4">
          <Database className="text-[#00f5d4] w-10 h-10" />
          <h1 className="text-3xl font-black italic uppercase">Importateur de Repas v2</h1>
        </div>

        <Card className="bg-[#1a1a20] border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <div className="border-2 border-dashed border-gray-700 rounded-xl p-8 text-center hover:border-[#00f5d4] transition cursor-pointer relative bg-black/20">
              <input type="file" accept=".csv" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
              <FileText className="mx-auto h-12 w-12 text-gray-500 mb-4" />
              <p className="text-lg font-bold text-white">{csvFile ? csvFile.name : "Glissez votre fichier CSV ici"}</p>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-lg flex gap-3 items-start">
                <AlertTriangle className="text-yellow-500 w-5 h-5 mt-0.5 shrink-0"/>
                <div className="text-xs text-yellow-200">
                    <p className="font-bold mb-1">Important pour les images :</p>
                    <p>Assurez-vous que vos images dans Firebase Storage (dossier <code>meals/</code>) portent exactement le nom de l'ID du repas (colonne 1 du CSV). Exemple : <code>meal_e5c18fhkc.jpg</code></p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-black/30 p-4 rounded-lg">
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Storage Bucket</label>
                    <Input disabled value={BUCKET_URL} className="bg-black border-gray-700 text-gray-400 font-mono text-[10px]" />
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Extension Image</label>
                    <Input 
                        value={imageExtension} 
                        onChange={(e) => setImageExtension(e.target.value)} 
                        className="bg-black border-gray-700 text-white" 
                        placeholder=".jpg"
                    />
                </div>
            </div>

            <Button 
              onClick={processCSV} 
              disabled={!csvFile || loading} 
              className="w-full bg-[#00f5d4] text-black font-black py-6 text-lg hover:bg-[#00f5d4]/80"
            >
              {loading ? "TRAITEMENT EN COURS..." : "LANCER L'IMPORTATION"}
            </Button>

            {loading && <Progress value={progress} className="h-2 bg-gray-800 [&>div]:bg-[#00f5d4]" />}

          </CardContent>
        </Card>

        <Card className="bg-black border-gray-800 h-64 overflow-hidden flex flex-col">
            <CardHeader className="py-3 border-b border-gray-800">
                <CardTitle className="text-xs font-mono uppercase text-gray-500">Logs Système</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1">
                {logs.map((log, i) => (
                    <p key={i} className={log.includes('ERREUR') ? "text-red-400" : "text-green-400"}>{log}</p>
                ))}
                {logs.length === 0 && <p className="text-gray-700 italic">En attente du fichier...</p>}
            </CardContent>
        </Card>

      </div>
    </div>
  );
}