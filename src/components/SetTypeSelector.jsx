import React from 'react';
import { Button } from "@/components/ui/button";
import {
  Layers, Zap, TrendingDown, TrendingUp, Repeat,
  Link2, Dumbbell, Flame, Target
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

export const SET_TYPES = {
  straight: {
    id: 'straight',
    name: 'Série Classique',
    shortName: 'Classic',
    icon: Dumbbell,
    color: 'bg-gray-600',
    textColor: 'text-gray-400',
    borderColor: 'border-gray-600',
    description: 'Séries standard avec repos entre chaque',
    minExercises: 1,
    maxExercises: 1
  },
  superset_antagonist: {
    id: 'superset_antagonist',
    name: 'Superset Antagoniste',
    shortName: 'Superset',
    icon: Link2,
    color: 'bg-blue-600',
    textColor: 'text-blue-400',
    borderColor: 'border-blue-600',
    description: 'Muscles opposés sans repos (ex: biceps/triceps)',
    minExercises: 2,
    maxExercises: 2
  },
  superset_agonist: {
    id: 'superset_agonist',
    name: 'Superset Agoniste',
    shortName: 'Agoniste',
    icon: Flame,
    color: 'bg-orange-600',
    textColor: 'text-orange-400',
    borderColor: 'border-orange-600',
    description: 'Même muscle enchaîné (épuisement intense)',
    minExercises: 2,
    maxExercises: 2
  },
  pre_exhaustion: {
    id: 'pre_exhaustion',
    name: 'Pré-fatigue',
    shortName: 'Pré-fatigue',
    icon: Target,
    color: 'bg-red-600',
    textColor: 'text-red-400',
    borderColor: 'border-red-600',
    description: 'Isolation puis composé (ex: leg ext + squat)',
    minExercises: 2,
    maxExercises: 2
  },
  triset: {
    id: 'triset',
    name: 'Tri-Set',
    shortName: 'Tri-Set',
    icon: Layers,
    color: 'bg-purple-600',
    textColor: 'text-purple-400',
    borderColor: 'border-purple-600',
    description: '3 exercices enchaînés sans pause',
    minExercises: 3,
    maxExercises: 3
  },
  giant_set: {
    id: 'giant_set',
    name: 'Série Géante',
    shortName: 'Giant',
    icon: Zap,
    color: 'bg-yellow-600',
    textColor: 'text-yellow-400',
    borderColor: 'border-yellow-600',
    description: '4+ exercices enchaînés (ultra intense)',
    minExercises: 4,
    maxExercises: 6
  },
  dropset: {
    id: 'dropset',
    name: 'Drop Set',
    shortName: 'Drop',
    icon: TrendingDown,
    color: 'bg-pink-600',
    textColor: 'text-pink-400',
    borderColor: 'border-pink-600',
    description: 'Réduire le poids à chaque échec',
    minExercises: 1,
    maxExercises: 1,
    hasDrops: true
  },
  pyramid: {
    id: 'pyramid',
    name: 'Pyramide',
    shortName: 'Pyramide',
    icon: TrendingUp,
    color: 'bg-emerald-600',
    textColor: 'text-emerald-400',
    borderColor: 'border-emerald-600',
    description: 'Augmenter poids, diminuer reps',
    minExercises: 1,
    maxExercises: 1,
    hasPyramid: true
  },
  reverse_pyramid: {
    id: 'reverse_pyramid',
    name: 'Pyramide Inversée',
    shortName: 'Reverse',
    icon: Repeat,
    color: 'bg-cyan-600',
    textColor: 'text-cyan-400',
    borderColor: 'border-cyan-600',
    description: 'Commencer lourd, réduire ensuite',
    minExercises: 1,
    maxExercises: 1,
    hasPyramid: true
  }
};

export const SET_TYPE_CATEGORIES = [
  {
    label: 'Base',
    types: ['straight']
  },
  {
    label: 'Supersets & Combinaisons',
    types: ['superset_antagonist', 'superset_agonist', 'pre_exhaustion', 'triset', 'giant_set']
  },
  {
    label: 'Techniques d\'Intensité',
    types: ['dropset']
  },
  {
    label: 'Progressions',
    types: ['pyramid', 'reverse_pyramid']
  }
];

export default function SetTypeSelector({ selectedType, onSelect, disabled }) {
  const currentType = SET_TYPES[selectedType] || SET_TYPES.straight;
  const Icon = currentType.icon;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={`h-9 px-3 border-2 ${currentType.borderColor} ${currentType.textColor} bg-black/50 hover:bg-black/70 font-bold text-xs rounded-lg transition-all`}
        >
          <Icon size={14} className="mr-1.5" />
          {currentType.shortName}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="bg-[#1a1a20] border-gray-700 text-white w-80 p-0 overflow-hidden"
        align="start"
      >
        <ScrollArea className="h-96 w-full">
          <div className="p-3">
            {SET_TYPE_CATEGORIES.map((category, idx) => (
              <div key={category.label} className="mb-2 last:mb-0">
                {idx > 0 && <DropdownMenuSeparator className="bg-gray-700 my-2" />}
                <DropdownMenuLabel className="text-[10px] text-gray-500 uppercase tracking-[0.2em] px-2 py-2">
                  {category.label}
                </DropdownMenuLabel>
                <div className="space-y-1">
                  {category.types.map(typeId => {
                    const type = SET_TYPES[typeId];
                    const TypeIcon = type.icon;
                    const isSelected = selectedType === typeId;

                    return (
                      <DropdownMenuItem
                        key={typeId}
                        onClick={() => onSelect(typeId)}
                        className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                          isSelected
                            ? `${type.color} text-white shadow-lg`
                            : 'hover:bg-white/5'
                        }`}
                      >
                        <div className={`p-2 rounded-lg shrink-0 ${isSelected ? 'bg-white/20' : type.color + '/20'}`}>
                          <TypeIcon size={16} className={isSelected ? 'text-white' : type.textColor} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm leading-tight">{type.name}</p>
                          <p className={`text-[10px] mt-1 leading-relaxed ${isSelected ? 'text-white/70' : 'text-gray-400'}`}>
                            {type.description}
                          </p>
                        </div>
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <ScrollBar className="bg-white/10" />
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
