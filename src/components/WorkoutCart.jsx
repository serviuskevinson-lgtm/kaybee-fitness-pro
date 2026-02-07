import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import {
  LayoutList, Plus, Save, Calendar as CalendarIcon,
  Play, Link2, Sparkles
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import SetTypeSelector, { SET_TYPES } from './SetTypeSelector';
import SetGroupBuilder from './SetGroupBuilder';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function WorkoutCart({
  groups,
  setGroups,
  pendingExercises,
  setPendingExercises,
  selectedSetType,
  setSelectedSetType,
  onSaveTemplate,
  onProgramWeek,
  onStartSession,
  isCoachView,
  t
}) {
  const [linkMode, setLinkMode] = useState(false);
  const [exercisesToLink, setExercisesToLink] = useState([]);

  const totalExercises = groups.reduce((sum, g) => sum + g.exercises.length, 0) + pendingExercises.length;

  const handleAddPendingToGroup = () => {
    if (pendingExercises.length === 0) return;

    const setType = SET_TYPES[selectedSetType];

    // Vérifier si on a assez d'exercices pour ce type
    if (pendingExercises.length < setType.minExercises && setType.minExercises > 1) {
      // Créer un groupe incomplet qui attend d'autres exercices
      const newGroup = {
        id: Date.now(),
        setType: selectedSetType,
        exercises: [...pendingExercises],
        sets: 3,
        rest: setType.minExercises > 1 ? 90 : 60,
        dropConfig: setType.hasDrops ? [{ percentage: 100, reps: 'max' }, { percentage: 75, reps: 'max' }] : undefined,
        pyramidConfig: setType.hasPyramid ? [
          { reps: 12, weight: 'léger' },
          { reps: 10, weight: 'moyen' },
          { reps: 8, weight: 'lourd' },
          { reps: 6, weight: 'max' }
        ] : undefined
      };
      setGroups([...groups, newGroup]);
    } else {
      // Créer le(s) groupe(s) complet(s)
      const exercisesToAdd = [...pendingExercises];
      const newGroups = [];

      while (exercisesToAdd.length > 0) {
        const groupExercises = exercisesToAdd.splice(0, setType.maxExercises);
        newGroups.push({
          id: Date.now() + Math.random(),
          setType: selectedSetType,
          exercises: groupExercises,
          sets: 3,
          rest: setType.minExercises > 1 ? 90 : 60,
          dropConfig: setType.hasDrops ? [{ percentage: 100, reps: 'max' }, { percentage: 75, reps: 'max' }] : undefined,
          pyramidConfig: setType.hasPyramid ? [
            { reps: 12, weight: 'léger' },
            { reps: 10, weight: 'moyen' },
            { reps: 8, weight: 'lourd' },
            { reps: 6, weight: 'max' }
          ] : undefined
        });
      }

      setGroups([...groups, ...newGroups]);
    }

    setPendingExercises([]);
  };

  const updateGroup = (index, updatedGroup) => {
    const newGroups = [...groups];
    newGroups[index] = updatedGroup;
    setGroups(newGroups);
  };

  const removeGroup = (index) => {
    setGroups(groups.filter((_, i) => i !== index));
  };

  const ungroupExercises = (index) => {
    const group = groups[index];
    const newGroups = groups.filter((_, i) => i !== index);

    // Convertir chaque exercice en groupe individuel "straight"
    const individualGroups = group.exercises.map(exo => ({
      id: Date.now() + Math.random(),
      setType: 'straight',
      exercises: [exo],
      sets: group.sets,
      rest: 60
    }));

    setGroups([...newGroups, ...individualGroups]);
  };

  const removePendingExercise = (uniqueId) => {
    setPendingExercises(pendingExercises.filter(e => e.uniqueId !== uniqueId));
  };

  return (
    <Card className="bg-[#1a1a20] border-gray-800 sticky top-4 h-[calc(100vh-100px)] flex flex-col shadow-[0_0_30px_rgba(0,0,0,0.5)] rounded-3xl overflow-hidden ring-1 ring-white/5">
      {/* Header */}
      <div className="p-6 border-b border-gray-800 bg-gradient-to-b from-[#252530] to-[#1a1a20]">
        <div className="flex justify-between items-center mb-1">
          <h2 className="font-black text-xl text-white flex items-center gap-2 italic uppercase">
            <LayoutList className="text-[#9d4edd]"/> {t('current_session')}
          </h2>
          <Badge className="bg-[#9d4edd] text-white font-bold px-2.5 py-0.5 text-xs">
            {totalExercises}
          </Badge>
        </div>
        <p className="text-xs text-gray-400 font-medium">{t('drag_adjust_save')}</p>
      </div>

      {/* Type selector pour les nouveaux ajouts */}
      {pendingExercises.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-800 bg-[#9d4edd]/10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <SetTypeSelector
                selectedType={selectedSetType}
                onSelect={setSelectedSetType}
              />
              <span className="text-xs text-gray-400 truncate">
                {pendingExercises.length} en attente
              </span>
            </div>
            <Button
              size="sm"
              onClick={handleAddPendingToGroup}
              className="bg-[#9d4edd] hover:bg-[#7b2cbf] text-white font-bold h-9 px-4 rounded-lg"
            >
              <Plus size={14} className="mr-1" />
              Valider
            </Button>
          </div>

          {/* Preview des exercices en attente */}
          <div className="flex flex-wrap gap-1 mt-2">
            {pendingExercises.map(exo => (
              <Badge
                key={exo.uniqueId}
                variant="outline"
                className="text-[10px] border-[#9d4edd]/50 text-white cursor-pointer hover:bg-red-500/20 hover:border-red-500 transition-colors"
                onClick={() => removePendingExercise(exo.uniqueId)}
              >
                {exo.name.slice(0, 20)}{exo.name.length > 20 ? '...' : ''} ×
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Liste des groupes */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          <AnimatePresence>
            {groups.map((group, index) => (
              <SetGroupBuilder
                key={group.id}
                group={group}
                index={index}
                onUpdate={(updated) => updateGroup(index, updated)}
                onRemove={() => removeGroup(index)}
                onUngroup={() => ungroupExercises(index)}
              />
            ))}
          </AnimatePresence>
        </div>

        {groups.length === 0 && pendingExercises.length === 0 && (
          <div className="text-center text-gray-500 py-10 italic flex flex-col items-center justify-center h-full">
            <div className="w-20 h-20 rounded-full bg-gray-800/30 flex items-center justify-center mb-4 border border-dashed border-gray-700">
              <Plus className="text-gray-600" size={32}/>
            </div>
            <p className="font-bold text-gray-400">{t('session_empty')}</p>
            <p className="text-xs mt-2 text-gray-600">{t('add_from_left')}</p>
          </div>
        )}
      </ScrollArea>

      {/* Actions */}
      <div className="p-5 border-t border-gray-800 bg-[#15151a] space-y-3">
        <Button
          disabled={groups.length === 0}
          onClick={onSaveTemplate}
          className="w-full bg-[#1a1a20] border border-gray-700 hover:bg-gray-800 text-white font-bold h-12 rounded-xl"
        >
          <Save className="mr-2 h-4 w-4" /> {t('save_favorite')}
        </Button>
        <Button
          disabled={groups.length === 0}
          onClick={onProgramWeek}
          className="w-full bg-[#7b2cbf] hover:bg-[#9d4edd] text-white font-bold h-12 rounded-xl"
        >
          <CalendarIcon className="mr-2 h-4 w-4" /> Programmer
        </Button>
        <Button
          className={`w-full font-black text-white h-14 text-lg rounded-xl shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] ${
            isCoachView
              ? 'bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd]'
              : 'bg-gradient-to-r from-[#00f5d4] to-[#00b89f] text-black'
          }`}
          disabled={groups.length === 0}
          onClick={onStartSession}
        >
          {isCoachView ? t('assign_to_client') : t('start')}
        </Button>
      </div>
    </Card>
  );
}
