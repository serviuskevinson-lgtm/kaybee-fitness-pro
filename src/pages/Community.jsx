import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Heart, MessageCircle, Share2, Image as ImageIcon, Award } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Community() {
  const [postContent, setPostContent] = useState('');
  const [postType, setPostType] = useState('General');
  const [privacy, setPrivacy] = useState('Amis');
  const [activeFilter, setActiveFilter] = useState('all');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: posts, isLoading } = useQuery({
    queryKey: ['posts', activeFilter],
    queryFn: async () => {
      const allPosts = await base44.entities.Post.list('-created_date', 50);
      
      if (activeFilter === 'all') return allPosts;
      if (activeFilter === 'mine') return allPosts.filter(p => p.created_by === user?.email);
      if (activeFilter === 'friends') {
        // TODO: Filter by friends when friend system is implemented
        return allPosts;
      }
      return allPosts;
    },
    initialData: []
  });

  const createPostMutation = useMutation({
    mutationFn: (data) => base44.entities.Post.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['posts']);
      setPostContent('');
      setPostType('General');
    }
  });

  const likePostMutation = useMutation({
    mutationFn: async ({ postId, currentLikes, likedBy }) => {
      const hasLiked = likedBy?.includes(user.email);
      
      return base44.entities.Post.update(postId, {
        likes_count: hasLiked ? currentLikes - 1 : currentLikes + 1,
        liked_by: hasLiked 
          ? likedBy.filter(email => email !== user.email)
          : [...(likedBy || []), user.email]
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['posts']);
    }
  });

  const handleCreatePost = () => {
    if (!postContent.trim()) return;

    createPostMutation.mutate({
      content: postContent,
      type: postType,
      privacy: privacy,
      likes_count: 0,
      liked_by: []
    });
  };

  const handleLikePost = (post) => {
    likePostMutation.mutate({
      postId: post.id,
      currentLikes: post.likes_count || 0,
      likedBy: post.liked_by || []
    });
  };

  const getPostTypeIcon = (type) => {
    switch(type) {
      case 'Workout': return '🏋️';
      case 'Meal': return '🍱';
      case 'Progress Photo': return '📸';
      case 'Achievement': return '🏆';
      default: return '💬';
    }
  };

  const getPrivacyColor = (privacy) => {
    switch(privacy) {
      case 'Public': return 'bg-green-100 text-green-800';
      case 'Amis': return 'bg-blue-100 text-blue-800';
      case 'Coach uniquement': return 'bg-purple-100 text-purple-800';
      case 'Coach et Amis': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#9d4edd] to-[#00f5d4] uppercase mb-2">
          Communauté KAYBEE
        </h1>
        <p className="text-gray-400">Partagez vos progrès et inspirez les autres</p>
      </div>

      {/* Create Post */}
      <Card className="kb-card">
        <CardContent className="p-6 space-y-4">
          <Textarea
            value={postContent}
            onChange={(e) => setPostContent(e.target.value)}
            placeholder="Partagez votre progression, un accomplissement, ou motivez la communauté..."
            className="bg-black border-gray-800 text-white min-h-[120px] resize-none"
          />

          <div className="flex flex-wrap gap-3 items-center">
            <Select value={postType} onValueChange={setPostType}>
              <SelectTrigger className="w-40 bg-black border-gray-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="General">💬 Général</SelectItem>
                <SelectItem value="Workout">🏋️ Entraînement</SelectItem>
                <SelectItem value="Meal">🍱 Repas</SelectItem>
                <SelectItem value="Progress Photo">📸 Photo Progrès</SelectItem>
                <SelectItem value="Achievement">🏆 Accomplissement</SelectItem>
              </SelectContent>
            </Select>

            <Select value={privacy} onValueChange={setPrivacy}>
              <SelectTrigger className="w-44 bg-black border-gray-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Privé">🔒 Privé</SelectItem>
                <SelectItem value="Coach uniquement">👨‍🏫 Coach uniquement</SelectItem>
                <SelectItem value="Amis">👥 Amis</SelectItem>
                <SelectItem value="Coach et Amis">👨‍🏫👥 Coach & Amis</SelectItem>
                <SelectItem value="Public">🌍 Public</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={handleCreatePost}
              disabled={!postContent.trim() || createPostMutation.isPending}
              className="ml-auto bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] font-bold"
            >
              {createPostMutation.isPending ? 'Publication...' : 'Publier'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Tabs value={activeFilter} onValueChange={setActiveFilter}>
        <TabsList className="bg-[#1a1a20] border border-gray-800">
          <TabsTrigger value="all">Tous les posts</TabsTrigger>
          <TabsTrigger value="mine">Mes posts</TabsTrigger>
          <TabsTrigger value="friends">Amis</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Posts Feed */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-[#7b2cbf] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400">Chargement des posts...</p>
          </div>
        ) : posts.length === 0 ? (
          <Card className="kb-card">
            <CardContent className="p-12 text-center">
              <MessageCircle className="w-16 h-16 mx-auto mb-4 text-gray-600" />
              <p className="text-gray-400">Aucun post pour le moment</p>
              <p className="text-sm text-gray-600 mt-2">Soyez le premier à partager quelque chose !</p>
            </CardContent>
          </Card>
        ) : (
          posts.map((post, index) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="kb-card hover:border-[#7b2cbf]/50 transition">
                <CardContent className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#7b2cbf] to-[#9d4edd] flex items-center justify-center font-bold">
                        {post.created_by?.split('@')[0].substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold">{post.created_by?.split('@')[0]}</p>
                        <p className="text-xs text-gray-500">
                          {format(new Date(post.created_date), 'PPp', { locale: fr })}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-2xl">{getPostTypeIcon(post.type)}</span>
                      <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${getPrivacyColor(post.privacy)}`}>
                        {post.privacy}
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <p className="text-gray-300 mb-4 whitespace-pre-wrap">{post.content}</p>

                  {/* Workout Data */}
                  {post.workout_data && (
                    <div className="bg-black/50 border border-gray-800 rounded p-3 mb-4">
                      <p className="text-xs text-gray-500 mb-2">Détails de l'entraînement:</p>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                          <p className="text-[10px] text-gray-500">Exercice</p>
                          <p className="font-bold text-sm">{post.workout_data.exercise}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500">Sets</p>
                          <p className="font-bold text-sm text-[#00f5d4]">{post.workout_data.sets}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500">Reps</p>
                          <p className="font-bold text-sm text-[#00f5d4]">{post.workout_data.reps}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500">Poids</p>
                          <p className="font-bold text-sm text-[#fdcb6e]">{post.workout_data.weight}kg</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-6 pt-4 border-t border-gray-800">
                    <button
                      onClick={() => handleLikePost(post)}
                      className="flex items-center gap-2 text-gray-400 hover:text-red-500 transition group"
                    >
                      <Heart 
                        className={`w-5 h-5 ${
                          post.liked_by?.includes(user?.email) 
                            ? 'fill-red-500 text-red-500' 
                            : 'group-hover:fill-red-500'
                        }`} 
                      />
                      <span className="text-sm font-bold">{post.likes_count || 0}</span>
                    </button>

                    <button className="flex items-center gap-2 text-gray-400 hover:text-[#00f5d4] transition">
                      <MessageCircle className="w-5 h-5" />
                      <span className="text-sm">Commenter</span>
                    </button>

                    <button className="flex items-center gap-2 text-gray-400 hover:text-[#9d4edd] transition">
                      <Share2 className="w-5 h-5" />
                      <span className="text-sm">Partager</span>
                    </button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}