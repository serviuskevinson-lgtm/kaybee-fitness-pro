import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Image as ImageIcon, Video, Trash2, Eye } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Gallery() {
  const [category, setCategory] = useState('all');
  const [uploadCategory, setUploadCategory] = useState('photos');
  const [uploadPrivacy, setUploadPrivacy] = useState('Amis');
  const [uploading, setUploading] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: posts, isLoading } = useQuery({
    queryKey: ['galleryPosts', user?.email],
    queryFn: async () => {
      const allPosts = await base44.entities.Post.filter({ created_by: user.email }, '-created_date');
      return allPosts.filter(p => p.media_urls && p.media_urls.length > 0);
    },
    initialData: [],
    enabled: !!user
  });

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const result = await base44.integrations.Core.UploadFile({ file });
      return result.file_url;
    }
  });

  const createPostMutation = useMutation({
    mutationFn: (data) => base44.entities.Post.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['galleryPosts']);
    }
  });

  const deletePostMutation = useMutation({
    mutationFn: (postId) => base44.entities.Post.delete(postId),
    onSuccess: () => {
      queryClient.invalidateQueries(['galleryPosts']);
    }
  });

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const url = await uploadMutation.mutateAsync(file);

      const isVideo = file.type.startsWith('video/');
      
      await createPostMutation.mutateAsync({
        content: `Photo ${uploadCategory}`,
        type: 'Progress Photo',
        media_urls: [url],
        privacy: uploadPrivacy,
        likes_count: 0,
        liked_by: []
      });

      alert('Média uploadé avec succès !');
    } catch (error) {
      console.error('Error uploading:', error);
      alert('Erreur lors de l\'upload');
    }
    setUploading(false);
  };

  const filteredPosts = category === 'all' 
    ? posts 
    : posts.filter(p => p.content.toLowerCase().includes(category.toLowerCase()));

  const getPrivacyIcon = (privacy) => {
    switch(privacy) {
      case 'Public': return '🌍';
      case 'Amis': return '👥';
      case 'Coach uniquement': return '👨‍🏫';
      case 'Coach et Amis': return '👨‍🏫👥';
      default: return '🔒';
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#7b2cbf] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Chargement...</p>
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
            Galerie Privée
          </h1>
          <p className="text-gray-400 mt-2">Suivez votre transformation physique</p>
        </div>
      </div>

      {/* Upload Section */}
      <Card className="kb-card border-[#7b2cbf]">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1">
              <label className="text-sm font-bold text-gray-400 mb-2 block uppercase">
                Catégorie
              </label>
              <Select value={uploadCategory} onValueChange={setUploadCategory}>
                <SelectTrigger className="bg-black border-gray-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="avant_apres">📸 Avant/Après</SelectItem>
                  <SelectItem value="photos">🖼️ Photos</SelectItem>
                  <SelectItem value="videos">🎥 Vidéos</SelectItem>
                  <SelectItem value="posture">🧘 Posture</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-1">
              <label className="text-sm font-bold text-gray-400 mb-2 block uppercase">
                Confidentialité
              </label>
              <Select value={uploadPrivacy} onValueChange={setUploadPrivacy}>
                <SelectTrigger className="bg-black border-gray-800">
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
            </div>

            <div className="md:col-span-2">
              <label className="text-sm font-bold text-gray-400 mb-2 block uppercase">
                Uploader un média
              </label>
              <div className="relative">
                <input
                  type="file"
                  id="mediaUpload"
                  accept="image/*,video/*"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                />
                <Button
                  onClick={() => document.getElementById('mediaUpload').click()}
                  disabled={uploading}
                  className="w-full bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] font-bold py-6"
                >
                  {uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Upload en cours...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5 mr-2" />
                      Choisir un fichier
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Filter */}
      <Tabs value={category} onValueChange={setCategory}>
        <TabsList className="bg-[#1a1a20] border border-gray-800">
          <TabsTrigger value="all">Tout</TabsTrigger>
          <TabsTrigger value="avant_apres">📸 Avant/Après</TabsTrigger>
          <TabsTrigger value="photos">🖼️ Photos</TabsTrigger>
          <TabsTrigger value="videos">🎥 Vidéos</TabsTrigger>
          <TabsTrigger value="posture">🧘 Posture</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Gallery Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredPosts.map((post, index) => (
          <motion.div
            key={post.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card className="kb-card h-full hover:border-[#00f5d4] transition group overflow-hidden">
              <CardContent className="p-0">
                <div className="relative aspect-square overflow-hidden cursor-pointer"
                  onClick={() => setSelectedMedia(post)}
                >
                  {post.media_urls[0].includes('.mp4') || post.media_urls[0].includes('video') ? (
                    <video
                      src={post.media_urls[0]}
                      className="w-full h-full object-cover group-hover:scale-110 transition duration-500"
                    />
                  ) : (
                    <img
                      src={post.media_urls[0]}
                      alt="Gallery item"
                      className="w-full h-full object-cover group-hover:scale-110 transition duration-500"
                      onError={(e) => {
                        e.target.src = 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop&q=80';
                      }}
                    />
                  )}

                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <Eye className="w-8 h-8 text-white" />
                  </div>

                  {/* Privacy Badge */}
                  <div className="absolute top-2 right-2">
                    <span className={`text-xs px-2 py-1 rounded-full font-bold ${getPrivacyColor(post.privacy)}`}>
                      {getPrivacyIcon(post.privacy)}
                    </span>
                  </div>

                  {/* Video Icon */}
                  {(post.media_urls[0].includes('.mp4') || post.media_urls[0].includes('video')) && (
                    <div className="absolute top-2 left-2">
                      <Video className="w-6 h-6 text-white" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  <p className="text-xs text-gray-400 mb-2">
                    {format(new Date(post.created_date), 'dd MMM yyyy', { locale: fr })}
                  </p>
                  <Button
                    onClick={() => {
                      if (confirm('Supprimer ce média ?')) {
                        deletePostMutation.mutate(post.id);
                      }
                    }}
                    variant="outline"
                    size="sm"
                    className="w-full border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                  >
                    <Trash2 className="w-3 h-3 mr-2" />
                    Supprimer
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {filteredPosts.length === 0 && (
        <Card className="kb-card">
          <CardContent className="p-12 text-center">
            <ImageIcon className="w-16 h-16 mx-auto mb-4 text-gray-600" />
            <p className="text-gray-400">Aucun média dans cette catégorie</p>
            <p className="text-sm text-gray-600 mt-2">Uploadez votre première photo pour commencer !</p>
          </CardContent>
        </Card>
      )}

      {/* Lightbox Modal */}
      {selectedMedia && (
        <div
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedMedia(null)}
        >
          <div className="max-w-5xl w-full" onClick={e => e.stopPropagation()}>
            <div className="relative">
              {selectedMedia.media_urls[0].includes('.mp4') || selectedMedia.media_urls[0].includes('video') ? (
                <video
                  src={selectedMedia.media_urls[0]}
                  controls
                  autoPlay
                  className="w-full max-h-[80vh] rounded-lg"
                />
              ) : (
                <img
                  src={selectedMedia.media_urls[0]}
                  alt="Full size"
                  className="w-full max-h-[80vh] object-contain rounded-lg"
                  onError={(e) => {
                    e.target.src = 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1200&h=800&fit=crop&q=80';
                  }}
                />
              )}

              <button
                onClick={() => setSelectedMedia(null)}
                className="absolute top-4 right-4 w-10 h-10 bg-black/80 rounded-full flex items-center justify-center hover:bg-black transition"
              >
                <span className="text-2xl text-white">×</span>
              </button>

              <div className="absolute bottom-4 left-4 right-4 bg-black/80 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold">{selectedMedia.content}</p>
                    <p className="text-sm text-gray-400">
                      {format(new Date(selectedMedia.created_date), 'PPP à HH:mm', { locale: fr })}
                    </p>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full font-bold ${getPrivacyColor(selectedMedia.privacy)}`}>
                    {getPrivacyIcon(selectedMedia.privacy)} {selectedMedia.privacy}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}