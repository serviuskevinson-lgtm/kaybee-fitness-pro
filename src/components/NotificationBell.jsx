import React, { useState } from 'react';
import { useNotifications } from '@/context/NotificationContext';
import { Bell, Check, MessageCircle, UserPlus, Trophy, AlertCircle, Wallet, Dumbbell, Apple, Clock } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function NotificationBell() { // On garde le même nom pour ne rien casser
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  // Choix de l'icône selon le type
  const getIcon = (type) => {
    switch(type) {
        case 'message': return <MessageCircle size={16} className="text-blue-400"/>;
        case 'friend_request': case 'friend_accept': return <UserPlus size={16} className="text-green-400"/>;
        case 'vote': case 'challenge': return <Trophy size={16} className="text-yellow-400"/>;
        case 'invoice': return <Wallet size={16} className="text-red-400"/>;
        case 'plan_workout': return <Dumbbell size={16} className="text-purple-400"/>;
        case 'plan_nutrition': return <Apple size={16} className="text-orange-400"/>;
        case 'reminder': return <Clock size={16} className="text-[#00f5d4]"/>;
        default: return <AlertCircle size={16} className="text-gray-400"/>;
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-full hover:bg-white/10 transition-colors text-gray-300 hover:text-white">
          <Bell className="w-6 h-6" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] px-1.5 h-4 min-w-[16px] flex items-center justify-center border-none animate-pulse">
              {unreadCount}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 bg-[#1a1a20] border-gray-800 text-white shadow-2xl mr-4" align="end">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
            <h4 className="font-bold text-sm">Notifications</h4>
            {unreadCount > 0 && (
                <button onClick={markAllAsRead} className="text-xs text-[#00f5d4] hover:underline flex items-center gap-1">
                    <Check size={12}/> Tout lire
                </button>
            )}
        </div>
        <ScrollArea className="h-[350px]">
            {notifications.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-xs">
                    Aucune notification récente.
                </div>
            ) : (
                <div className="divide-y divide-gray-800">
                    {notifications.map((notif) => (
                        <div 
                            key={notif.id} 
                            onClick={() => markAsRead(notif.id)}
                            className={`p-4 hover:bg-white/5 cursor-pointer transition-colors ${notif.status === 'unread' ? 'bg-[#00f5d4]/5' : ''}`}
                        >
                            <div className="flex gap-3">
                                <div className="mt-1 bg-gray-800 p-1.5 rounded-full h-fit">
                                    {getIcon(notif.type)}
                                </div>
                                <div className="flex-1 space-y-1">
                                    <div className="flex justify-between items-start">
                                        <p className="text-sm font-bold text-white leading-none">{notif.title}</p>
                                        <span className="text-[9px] text-gray-500 whitespace-nowrap ml-2">
                                            {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true, locale: fr })}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-400 leading-snug">{notif.message}</p>
                                </div>
                                {notif.status === 'unread' && (
                                    <div className="w-2 h-2 rounded-full bg-[#00f5d4] mt-2 flex-shrink-0"/>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}