import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus, X, Check, Trash2, Clock, ChevronDown, ChevronUp,
  Link2, Unlink
} from 'lucide-react';
import { SET_TYPES } from './SetTypeSelector';
import { motion, AnimatePresence } from 'framer-motion';

export default function SetGroupBuilder({
  group,
  onUpdate,
  onRemove,
  onUngroup,
  index
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const setType = SET_TYPES[group.setType] || SET_TYPES.straight;
  const Icon = setType.icon;

  const updateExercise = (exIndex, field, value) => {
    const newExercises = [...group.exercises];
    newExercises[exIndex] = { ...newExercises[exIndex], [field]: value };
    onUpdate({ ...group, exercises: newExercises });
  };

  const removeExercise = (exIndex) => {
    if (group.exercises.length <= 1) {
      onRemove();
      return;
    }
    const newExercises = group.exercises.filter((_, i) => i !== exIndex);
    onUpdate({ ...group, exercises: newExercises });
  };

  const updateGroupSets = (value) => {
    onUpdate({ ...group, sets: parseInt(value) || 1 });
  };

  const updateGroupRest = (value) => {
    onUpdate({ ...group, rest: parseInt(value) || 60 });
  };

  const updateDropConfig = (dropIndex, field, value) => {
    const newDrops = [...(group.dropConfig || [])];
    newDrops[dropIndex] = { ...newDrops[dropIndex], [field]: value };
    onUpdate({ ...group, dropConfig: newDrops });
  };

  const addDrop = () => {
    const currentDrops = group.dropConfig || [{ percentage: 100, reps: 'max' }];
    onUpdate({
      ...group,
      dropConfig: [...currentDrops, { percentage: 70 - (currentDrops.length - 1) * 15, reps: 'max' }]
    });
  };

  const removeDrop = (dropIndex) => {
    if ((group.dropConfig?.length || 0) <= 2) return;
    const newDrops = group.dropConfig.filter((_, i) => i !== dropIndex);
    onUpdate({ ...group, dropConfig: newDrops });
  };

  const updatePyramidConfig = (setIndex, field, value) => {
    const newPyramid = [...(group.pyramidConfig || [])];
    newPyramid[setIndex] = { ...newPyramid[setIndex], [field]: value };
    onUpdate({ ...group, pyramidConfig: newPyramid });
  };

  const isMultiExercise = setType.minExercises > 1;
  const needsMoreExercises = group.exercises.length < setType.minExercises;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      className={`rounded-2xl border-2 ${setType.borderColor} bg-gradient-to-br from-[#0f0f13] to-[#1a1a20] overflow-hidden mb-4`}
    >
      <div
        className={`px-4 py-3 ${setType.color} flex items-center justify-between cursor-pointer`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-black">
            {index + 1}
          </span>
          <Icon size={18} />
          <div>
            <span className="font-bold text-sm text-white">{setType.name}</span>
            {isMultiExercise && (
              <span className="ml-2 text-white/60 text-xs">
                ({group.exercises.length}/{setType.maxExercises} exos)
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-white">
          {isMultiExercise && group.exercises.length >= 2 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => { e.stopPropagation(); onUngroup(); }}
              className="h-7 px-2 text-white/70 hover:text-white hover:bg-white/10"
            >
              <Unlink size={14} className="mr-1" />
              <span className="text-xs">Séparer</span>
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="h-7 w-7 p-0 text-white/70 hover:text-red-400 hover:bg-red-500/20"
          >
            <Trash2 size={14} />
          </Button>
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-4">
              {needsMoreExercises && (
                <div className={`p-3 rounded-xl ${setType.color}/20 border ${setType.borderColor} text-center`}>
                  <p className={`text-xs ${setType.textColor} font-medium`}>
                    Ajoute encore {setType.minExercises - group.exercises.length} exercice(s) pour compléter ce {setType.shortName}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                {group.exercises.map((exo, exIndex) => (
                  <div
                    key={exo.uniqueId}
                    className="bg-black/40 rounded-xl p-3 border border-gray-800"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {isMultiExercise && (
                          <span className={`w-5 h-5 rounded-full ${setType.color}/30 ${setType.textColor} flex items-center justify-center text-[10px] font-bold`}>
                            {String.fromCharCode(65 + exIndex)}
                          </span>
                        )}
                        <span className="font-bold text-sm text-white truncate max-w-[180px]">
                          {exo.name}
                        </span>
                      </div>
                      <button
                        onClick={() => removeExercise(exIndex)}
                        className="text-gray-600 hover:text-red-500 transition-colors p-1"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {!setType.hasDrops && !setType.hasPyramid && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-[#1a1a20] p-1.5 rounded-lg border border-gray-700">
                          <label className="text-[9px] text-gray-500 font-bold uppercase block text-center">Reps</label>
                          <Input
                            type="number"
                            value={exo.reps || 10}
                            onChange={(e) => updateExercise(exIndex, 'reps', e.target.value)}
                            className="h-6 text-sm bg-transparent border-none text-center text-white font-bold p-0"
                          />
                        </div>
                        <div className="bg-[#1a1a20] p-1.5 rounded-lg border border-gray-700">
                          <label className="text-[9px] text-gray-500 font-bold uppercase block text-center">Poids</label>
                          <Input
                            type="text"
                            value={exo.weight || ''}
                            onChange={(e) => updateExercise(exIndex, 'weight', e.target.value)}
                            placeholder="kg"
                            className="h-6 text-sm bg-transparent border-none text-center text-white font-bold p-0"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {setType.hasDrops && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-400 uppercase">Drops</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={addDrop}
                      className="h-7 text-xs text-pink-400 hover:text-pink-300"
                    >
                      <Plus size={12} className="mr-1" /> Ajouter drop
                    </Button>
                  </div>
                  {(group.dropConfig || [{ percentage: 100, reps: 'max' }, { percentage: 75, reps: 'max' }]).map((drop, dropIdx) => (
                    <div key={dropIdx} className="flex items-center gap-2 bg-black/40 p-2 rounded-lg">
                      <Badge className="bg-pink-600/30 text-pink-400 border-none text-[10px]">
                        Drop {dropIdx + 1}
                      </Badge>
                      <Input
                        type="number"
                        value={drop.percentage}
                        onChange={(e) => updateDropConfig(dropIdx, 'percentage', e.target.value)}
                        className="w-16 h-7 text-xs bg-gray-800 border-gray-700 text-center text-white"
                        placeholder="%"
                      />
                      <span className="text-gray-500 text-xs">%</span>
                      <Input
                        type="text"
                        value={drop.reps}
                        onChange={(e) => updateDropConfig(dropIdx, 'reps', e.target.value)}
                        className="w-16 h-7 text-xs bg-gray-800 border-gray-700 text-center text-white"
                        placeholder="reps"
                      />
                      <span className="text-gray-500 text-xs">reps</span>
                      {dropIdx > 1 && (
                        <button onClick={() => removeDrop(dropIdx)} className="text-gray-600 hover:text-red-500">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {setType.hasPyramid && (
                <div className="space-y-3">
                  <span className="text-xs font-bold text-gray-400 uppercase">Configuration Pyramide</span>
                  {(group.pyramidConfig || [
                    { reps: 12, weight: 'léger' },
                    { reps: 10, weight: 'moyen' },
                    { reps: 8, weight: 'lourd' },
                    { reps: 6, weight: 'max' }
                  ]).map((set, setIdx) => (
                    <div key={setIdx} className="flex items-center gap-2 bg-black/40 p-2 rounded-lg">
                      <Badge className={`${setType.color}/30 ${setType.textColor} border-none text-[10px]`}>
                        Set {setIdx + 1}
                      </Badge>
                      <Input
                        type="number"
                        value={set.reps}
                        onChange={(e) => updatePyramidConfig(setIdx, 'reps', e.target.value)}
                        className="w-16 h-7 text-xs bg-gray-800 border-gray-700 text-center text-white"
                      />
                      <span className="text-gray-500 text-xs">reps @</span>
                      <Input
                        type="text"
                        value={set.weight}
                        onChange={(e) => updatePyramidConfig(setIdx, 'weight', e.target.value)}
                        className="flex-1 h-7 text-xs bg-gray-800 border-gray-700 text-center text-white"
                        placeholder="poids/intensité"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-800">
                <div className="bg-[#1a1a20] p-2 rounded-xl border border-gray-700">
                  <label className="text-[9px] text-[#9d4edd] font-bold uppercase block text-center mb-1">
                    {isMultiExercise ? 'Tours' : 'Séries'}
                  </label>
                  <Input
                    type="number"
                    value={group.sets || 3}
                    onChange={(e) => updateGroupSets(e.target.value)}
                    className="h-8 text-base bg-gray-800 border-none text-center text-white font-bold"
                  />
                </div>
                <div className="bg-[#1a1a20] p-2 rounded-xl border border-gray-700">
                  <label className="text-[9px] text-[#9d4edd] font-bold uppercase block text-center mb-1 flex items-center justify-center gap-1">
                    <Clock size={10} /> Repos (sec)
                  </label>
                  <Input
                    type="number"
                    value={group.rest || 60}
                    onChange={(e) => updateGroupRest(e.target.value)}
                    className="h-8 text-base bg-gray-800 border-none text-center text-white font-bold"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
