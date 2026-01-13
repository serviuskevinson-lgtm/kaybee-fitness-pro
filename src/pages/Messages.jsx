import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Send, MessageCircle, Users, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Messages() {
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messageText, setMessageText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: userProfile } = useQuery({
    queryKey: ['userProfile', user?.email],
    queryFn: async () => {
      const profiles = await base44.entities.User.filter({ email: user.email });
      return profiles.length > 0 ? profiles[0] : null;
    },
    enabled: !!user
  });

  // Get all messages
  const { data: allMessages } = useQuery({
    queryKey: ['messages'],
    queryFn: async () => {
      const sent = await base44.entities.Message.filter({ created_by: user.email });
      const received = await base44.entities.Message.filter({ recipient_email: user.email });
      return [...sent, ...received].sort((a, b) => 
        new Date(b.created_date) - new Date(a.created_date)
      );
    },
    initialData: [],
    enabled: !!user
  });

  // Group messages into conversations
  const conversations = {};
  allMessages.forEach(msg => {
    const otherPerson = msg.created_by === user?.email ? msg.recipient_email : msg.created_by;
    if (!conversations[otherPerson]) {
      conversations[otherPerson] = [];
    }
    conversations[otherPerson].push(msg);
  });

  // Get unread count per conversation
  const getUnreadCount = (email) => {
    return allMessages.filter(m => 
      m.created_by === email && 
      m.recipient_email === user?.email && 
      !m.read
    ).length;
  };

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: (data) => base44.entities.Message.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['messages']);
      setMessageText('');
    }
  });

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: (messageId) => base44.entities.Message.update(messageId, { read: true }),
    onSuccess: () => {
      queryClient.invalidateQueries(['messages']);
    }
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConversation, allMessages]);

  // Mark messages as read when conversation is selected
  useEffect(() => {
    if (selectedConversation) {
      const unreadMessages = conversations[selectedConversation]?.filter(m => 
        m.recipient_email === user?.email && !m.read
      ) || [];
      
      unreadMessages.forEach(msg => {
        markAsReadMutation.mutate(msg.id);
      });
    }
  }, [selectedConversation]);

  const handleSendMessage = () => {
    if (!messageText.trim() || !selectedConversation) return;

    const conversationId = [user.email, selectedConversation].sort().join('_');
    
    sendMessageMutation.mutate({
      conversation_id: conversationId,
      recipient_email: selectedConversation,
      content: messageText,
      sender_name: user.full_name || user.email.split('@')[0],
      read: false
    });
  };

  const filteredConversations = Object.keys(conversations).filter(email =>
    email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // If coach exists, add them to conversations if not already there
  const coachEmail = userProfile?.coach_email;
  if (coachEmail && !conversations[coachEmail] && !filteredConversations.includes(coachEmail)) {
    conversations[coachEmail] = [];
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6">
      {/* Conversations List */}
      <Card className="kb-card w-80 flex flex-col">
        <CardHeader className="border-b border-gray-800">
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-[#9d4edd]" />
            Messages
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          <div className="p-4 border-b border-gray-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher..."
                className="pl-10 bg-black border-gray-800"
              />
            </div>
          </div>

          <div className="overflow-y-auto h-full">
            {/* Coach conversation (if exists) */}
            {coachEmail && (
              <div
                onClick={() => setSelectedConversation(coachEmail)}
                className={`p-4 border-b border-gray-800 cursor-pointer transition ${
                  selectedConversation === coachEmail
                    ? 'bg-[#7b2cbf]/20 border-l-4 border-l-[#7b2cbf]'
                    : 'hover:bg-gray-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#fdcb6e] to-[#00f5d4] flex items-center justify-center font-bold">
                    👨‍🏫
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-white truncate">Mon Coach</p>
                      {getUnreadCount(coachEmail) > 0 && (
                        <Badge className="bg-[#00f5d4] text-black">
                          {getUnreadCount(coachEmail)}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{coachEmail}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Other conversations */}
            {filteredConversations
              .filter(email => email !== coachEmail)
              .map((email) => {
                const msgs = conversations[email];
                const lastMsg = msgs[0];
                const unread = getUnreadCount(email);

                return (
                  <div
                    key={email}
                    onClick={() => setSelectedConversation(email)}
                    className={`p-4 border-b border-gray-800 cursor-pointer transition ${
                      selectedConversation === email
                        ? 'bg-[#7b2cbf]/20 border-l-4 border-l-[#7b2cbf]'
                        : 'hover:bg-gray-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#7b2cbf] to-[#9d4edd] flex items-center justify-center font-bold">
                        {email.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-white truncate">
                            {email.split('@')[0]}
                          </p>
                          {unread > 0 && (
                            <Badge className="bg-[#00f5d4] text-black">{unread}</Badge>
                          )}
                        </div>
                        {lastMsg && (
                          <p className="text-xs text-gray-400 truncate">
                            {lastMsg.content.substring(0, 30)}...
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* Chat Area */}
      <Card className="kb-card flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            <CardHeader className="border-b border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#7b2cbf] to-[#9d4edd] flex items-center justify-center font-bold">
                  {selectedConversation === coachEmail ? '👨‍🏫' : selectedConversation.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-white">
                    {selectedConversation === coachEmail ? 'Mon Coach' : selectedConversation.split('@')[0]}
                  </p>
                  <p className="text-xs text-gray-400">{selectedConversation}</p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-6 space-y-4">
              {conversations[selectedConversation]
                ?.slice()
                .reverse()
                .map((msg, index) => {
                  const isMe = msg.created_by === user?.email;
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                          isMe
                            ? 'bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] text-white'
                            : 'bg-gray-800 text-gray-200'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        <p className={`text-[10px] mt-2 ${isMe ? 'text-gray-300' : 'text-gray-500'}`}>
                          {format(new Date(msg.created_date), 'HH:mm')}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              <div ref={messagesEndRef} />
            </CardContent>

            <div className="p-4 border-t border-gray-800">
              <div className="flex gap-3">
                <Textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Écrivez votre message..."
                  className="bg-black border-gray-800 text-white resize-none"
                  rows={2}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!messageText.trim() || sendMessageMutation.isPending}
                  className="bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] px-6"
                >
                  <Send className="w-5 h-5" />
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Appuyez sur Entrée pour envoyer • Shift+Entrée pour nouvelle ligne
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle className="w-16 h-16 mx-auto mb-4 text-gray-600" />
              <p className="text-gray-400">Sélectionnez une conversation</p>
              <p className="text-sm text-gray-600 mt-2">
                {coachEmail ? 'Contactez votre coach ou vos amis' : 'Aucune conversation pour le moment'}
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}