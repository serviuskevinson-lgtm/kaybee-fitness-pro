import React, { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { createPageUrl } from "../lib/utils";

export default function NotificationBell({ userEmail }) {
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', userEmail],
    queryFn: async () => {
      const notifs = await base44.entities.Notification.filter(
        { recipient_email: userEmail },
        '-created_date',
        50
      );
      return notifs;
    },
    enabled: !!userEmail,
    refetchInterval: 5000 // Refresh every 5 seconds
  });

  const markAsReadMutation = useMutation({
    mutationFn: (notifId) => base44.entities.Notification.update(notifId, { read: true }),
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications']);
    }
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const unreadNotifs = notifications.filter(n => !n.read);
      await Promise.all(
        unreadNotifs.map(n => base44.entities.Notification.update(n.id, { read: true }))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications']);
    }
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const getNotificationIcon = (type) => {
    switch(type) {
      case 'message': return '💬';
      case 'coach_request': return '👨‍🏫';
      case 'mention': return '🔔';
      case 'birthday': return '🎂';
      case 'achievement': return '🏆';
      default: return '🔔';
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative hover:text-[#00f5d4] transition">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 bg-red-500 text-white text-xs">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0 bg-[#1a1a20] border-gray-800" align="end">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="font-bold text-white">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllAsReadMutation.mutate()}
              className="text-xs text-[#9d4edd] hover:text-[#00f5d4]"
            >
              Tout marquer comme lu
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Bell className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Aucune notification</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                className={`p-4 border-b border-gray-800 hover:bg-gray-900 transition cursor-pointer ${
                  !notif.read ? 'bg-[#7b2cbf]/10' : ''
                }`}
                onClick={() => {
                  if (!notif.read) {
                    markAsReadMutation.mutate(notif.id);
                  }
                }}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{getNotificationIcon(notif.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-white text-sm">{notif.title}</p>
                      {!notif.read && (
                        <div className="w-2 h-2 bg-[#00f5d4] rounded-full flex-shrink-0 mt-1"></div>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{notif.message}</p>
                    <p className="text-xs text-gray-600 mt-2">
                      {format(new Date(notif.created_date), 'PPp', { locale: fr })}
                    </p>
                    {notif.link && (
                      <Link
                        to={notif.link}
                        className="text-xs text-[#9d4edd] hover:text-[#00f5d4] mt-2 inline-block"
                      >
                        Voir →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}