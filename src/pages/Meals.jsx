import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  UtensilsCrossed, Clock, Flame, ChefHat, 
  Sparkles, ChevronLeft, ChevronRight 
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function Meals() {
  const [mealType, setMealType] = useState('all');
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const ITEMS_PER_PAGE = 50;
  const queryClient = useQueryClient();

  const { data: meals, isLoading } = useQuery({
    queryKey: ['meals'],
    queryFn: () => base44.entities.Meal.list('-created_date'),
    initialData: []
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  // Generate AI meals
  const generateAIMeals = async () => {
    setIsGenerating(true);
    try {
      const mealTypes = ['Déjeuner', 'Dîner', 'Dessert'];
      const mealsToGenerate = 50;
      
      for (let i = 0; i < mealsToGenerate; i++) {
        const type = mealTypes[i % 3];
        
        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `Generate a detailed ${type} recipe for fitness enthusiasts. Return JSON with: name (French), description (French, 2 sentences), ingredients (array of 5-8 items in French), calories (300-800), protein (20-60g), carbs (30-100g), fat (10-40g), prep_time (15-45 minutes). Make it healthy and delicious.`,
          response_json_schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              ingredients: { type: "array", items: { type: "string" } },
              calories: { type: "number" },
              protein: { type: "number" },
              carbs: { type: "number" },
              fat: { type: "number" },
              prep_time: { type: "number" }
            }
          }
        });

        // Generate meal image
        const imageResult = await base44.integrations.Core.GenerateImage({
          prompt: `Professional food photography of ${result.name}, appetizing, healthy meal, restaurant quality, natural lighting, top view, on white plate`
        });

        await base44.entities.Meal.create({
          ...result,
          meal_type: type,
          image_url: imageResult.url
        });
      }

      queryClient.invalidateQueries(['meals']);
    } catch (error) {
      console.error('Error generating meals:', error);
    }
    setIsGenerating(false);
  };

  const filteredMeals = mealType === 'all' 
    ? meals 
    : meals.filter(m => m.meal_type === mealType);

  const totalPages = Math.ceil(filteredMeals.length / ITEMS_PER_PAGE);
  const paginatedMeals = filteredMeals.slice(
    currentPage * ITEMS_PER_PAGE,
    (currentPage + 1) * ITEMS_PER_PAGE
  );

  const getDifficultyColor = (prepTime) => {
    if (prepTime <= 20) return 'bg-green-100 text-green-800';
    if (prepTime <= 35) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getDifficultyLabel = (prepTime) => {
    if (prepTime <= 20) return 'Facile';
    if (prepTime <= 35) return 'Moyen';
    return 'Difficile';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#7b2cbf] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Chargement des repas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#9d4edd] to-[#00f5d4] uppercase">
            Menu du Jour
          </h1>
          <p className="text-gray-400 mt-2">50 plats quotidiens générés par IA</p>
        </div>

        {meals.length === 0 && (
          <Button
            onClick={generateAIMeals}
            disabled={isGenerating}
            className="bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] font-bold"
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Génération...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Générer 50 Plats IA
              </>
            )}
          </Button>
        )}
      </div>

      {/* Filters */}
      <Tabs value={mealType} onValueChange={setMealType}>
        <TabsList className="bg-[#1a1a20] border border-gray-800">
          <TabsTrigger value="all">Tous</TabsTrigger>
          <TabsTrigger value="Déjeuner">🌅 Déjeuner</TabsTrigger>
          <TabsTrigger value="Dîner">🌙 Dîner</TabsTrigger>
          <TabsTrigger value="Dessert">🍰 Dessert</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Meals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {paginatedMeals.map((meal, index) => (
          <motion.div
            key={meal.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.02 }}
          >
            <Card 
              className="kb-card h-full hover:border-[#9d4edd] transition group cursor-pointer"
              onClick={() => {
                setSelectedMeal(meal);
                setShowModal(true);
              }}
            >
              <CardContent className="p-0">
                {/* Image */}
                <div className="relative h-48 overflow-hidden rounded-t-lg">
                  <img
                    src={meal.image_url || `https://source.unsplash.com/400x300/?${encodeURIComponent(meal.name)},food`}
                    alt={meal.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition duration-500"
                    onError={(e) => {
                      e.target.src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop&q=80';
                    }}
                  />
                  <div className="absolute top-2 left-2">
                    <Badge className="bg-black/80 text-white">
                      {meal.meal_type}
                    </Badge>
                  </div>
                  <div className="absolute top-2 right-2">
                    <Badge className={getDifficultyColor(meal.prep_time)}>
                      {getDifficultyLabel(meal.prep_time)}
                    </Badge>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 space-y-3">
                  <h3 className="font-black text-lg leading-tight line-clamp-2">
                    {meal.name}
                  </h3>

                  <p className="text-xs text-gray-400 line-clamp-2">
                    {meal.description}
                  </p>

                  {/* Macros */}
                  <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
                    <div className="bg-black/50 p-2 rounded">
                      <Flame className="w-3 h-3 mx-auto mb-1 text-[#fdcb6e]" />
                      <p className="font-bold">{meal.calories}</p>
                      <p className="text-gray-500">kcal</p>
                    </div>
                    <div className="bg-black/50 p-2 rounded">
                      <span className="block text-[#00f5d4] mb-1">🍗</span>
                      <p className="font-bold">{meal.protein}g</p>
                      <p className="text-gray-500">prot</p>
                    </div>
                    <div className="bg-black/50 p-2 rounded">
                      <span className="block text-[#9d4edd] mb-1">🥖</span>
                      <p className="font-bold">{meal.carbs}g</p>
                      <p className="text-gray-500">carbs</p>
                    </div>
                    <div className="bg-black/50 p-2 rounded">
                      <span className="block text-[#fdcb6e] mb-1">🥑</span>
                      <p className="font-bold">{meal.fat}g</p>
                      <p className="text-gray-500">fat</p>
                    </div>
                  </div>

                  {/* Time */}
                  <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-800">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{meal.prep_time} min</span>
                    </div>
                    <ChefHat className="w-4 h-4 text-[#7b2cbf]" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-8">
          <Button
            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            variant="outline"
            className="border-gray-800"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Précédent
          </Button>

          <span className="text-sm font-bold text-gray-400">
            Page {currentPage + 1} / {totalPages}
          </span>

          <Button
            onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
            variant="outline"
            className="border-gray-800"
          >
            Suivant
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}

      {/* Meal Detail Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-3xl bg-[#0a0a0c] border-gray-800 text-white max-h-[90vh] overflow-y-auto">
          {selectedMeal && (
            <div className="space-y-6">
              <DialogHeader>
                <DialogTitle className="text-3xl font-black text-[#9d4edd]">
                  {selectedMeal.name}
                </DialogTitle>
              </DialogHeader>

              {/* Image */}
              <div className="relative h-64 rounded-lg overflow-hidden">
                <img
                  src={selectedMeal.image_url || `https://source.unsplash.com/800x600/?${encodeURIComponent(selectedMeal.name)},food`}
                  alt={selectedMeal.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&h=600&fit=crop&q=80';
                  }}
                />
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-[#7b2cbf]/20 text-[#9d4edd] border-[#7b2cbf] px-4 py-2">
                  {selectedMeal.meal_type}
                </Badge>
                <Badge className={`${getDifficultyColor(selectedMeal.prep_time)} px-4 py-2`}>
                  {getDifficultyLabel(selectedMeal.prep_time)}
                </Badge>
                <Badge variant="outline" className="px-4 py-2">
                  <Clock className="w-3 h-3 mr-1" />
                  {selectedMeal.prep_time} minutes
                </Badge>
              </div>

              {/* Description */}
              <p className="text-gray-300 italic">"{selectedMeal.description}"</p>

              {/* Macros Grid */}
              <div className="grid grid-cols-4 gap-4">
                <Card className="bg-black/50 border-gray-800">
                  <CardContent className="p-4 text-center">
                    <Flame className="w-8 h-8 mx-auto mb-2 text-[#fdcb6e]" />
                    <p className="text-2xl font-black text-[#fdcb6e]">{selectedMeal.calories}</p>
                    <p className="text-xs text-gray-500 uppercase">Calories</p>
                  </CardContent>
                </Card>
                <Card className="bg-black/50 border-gray-800">
                  <CardContent className="p-4 text-center">
                    <span className="block text-4xl mb-2">🍗</span>
                    <p className="text-2xl font-black text-[#00f5d4]">{selectedMeal.protein}g</p>
                    <p className="text-xs text-gray-500 uppercase">Protéines</p>
                  </CardContent>
                </Card>
                <Card className="bg-black/50 border-gray-800">
                  <CardContent className="p-4 text-center">
                    <span className="block text-4xl mb-2">🥖</span>
                    <p className="text-2xl font-black text-[#9d4edd]">{selectedMeal.carbs}g</p>
                    <p className="text-xs text-gray-500 uppercase">Glucides</p>
                  </CardContent>
                </Card>
                <Card className="bg-black/50 border-gray-800">
                  <CardContent className="p-4 text-center">
                    <span className="block text-4xl mb-2">🥑</span>
                    <p className="text-2xl font-black text-white">{selectedMeal.fat}g</p>
                    <p className="text-xs text-gray-500 uppercase">Lipides</p>
                  </CardContent>
                </Card>
              </div>

              {/* Ingredients */}
              <div>
                <h3 className="font-bold text-lg mb-3 border-b border-gray-800 pb-2">
                  INGRÉDIENTS
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {selectedMeal.ingredients?.map((ingredient, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <span className="text-[#00f5d4]">✓</span>
                      <span>{ingredient}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <Button
                onClick={() => setShowModal(false)}
                className="w-full bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] font-bold py-6"
              >
                Ajouter au Planning
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}