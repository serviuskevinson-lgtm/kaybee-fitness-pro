import React, { useState, useEffect } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import ClientSelector from '@/components/coach/ClientSelector';
import { useTranslation } from 'react-i18next';
import { UserCheck, Watch, Apple } from 'lucide-react';
import {
  LayoutDashboard,
  Dumbbell,
  Utensils,
  Timer,
  LineChart,
  Image as ImageIcon,
  MessageSquare,
  Trophy,
  LogOut,
  User,
  Users,
  CreditCard
} from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";

export default function AppSidebar() {
  const location = useLocation();
  const { logout, currentUser } = useAuth();
  const navigate = useNavigate();
  const [isCoach, setIsCoach] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const checkRole = async () => {
        if(currentUser) {
            const snap = await getDoc(doc(db, "users", currentUser.uid));
            if(snap.exists() && snap.data().role === 'coach') {
                setIsCoach(true);
            }
        }
    };
    checkRole();
  }, [currentUser]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error("Erreur déconnexion", error);
    }
  };

  const items = [
    { title: t('dashboard'), url: "/", icon: LayoutDashboard },
    { title: t('exercises'), url: "/exercises", icon: Dumbbell },
    { title: t('meals'), url: "/meals", icon: Utensils },
    { title: t('session_active'), url: "/session", icon: Timer },
    { title: t('history'), url: "/performance", icon: LineChart },
    { title: "Historique Nutritif", url: "/nutrition", icon: Apple }, // Renommé et déplacé ici
    { title: "Galerie", url: "/gallery", icon: ImageIcon },
    { title: t('messages'), url: "/messages", icon: MessageSquare },
    { title: t('challenges'), url: "/challenges", icon: Trophy },
    { title: t('community'), url: "/community", icon: Users },
    { title: t('my_coach'), url: "/mon-coach", icon: UserCheck },
    { title: "Ma Montre", url: "/watch-pairing", icon: Watch },
  ];

  if (isCoach) {
      items.push({ title: t('finance'), url: "/coach/payments", icon: CreditCard });
  }

  return (
    <Sidebar className="border-r border-[#7b2cbf]/30 bg-[#0a0a0f]/95 text-white" collapsible="icon">
      
      <SidebarHeader className="flex flex-col justify-center border-b border-[#7b2cbf]/20 pt-4 pb-2">
         <div className="flex items-center gap-2 px-4 w-full overflow-hidden transition-all mb-4">
             <img 
               src="https://firebasestorage.googleapis.com/v0/b/kaybee-fitness.firebasestorage.app/o/Logo%20.png?alt=media&token=8d0e94d1-3989-4894-b249-10f5945cf172" 
               alt="Logo" 
               className="h-8 w-auto object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]"
             />
             <span className="font-bold text-lg whitespace-nowrap group-data-[collapsible=icon]:hidden text-[#00f5d4]">
                Kaybee
             </span>
         </div>
         
         <div className="group-data-[collapsible=icon]:hidden">
            {isCoach && <ClientSelector />}
         </div>
      </SidebarHeader>

      <SidebarContent className="py-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive = location.pathname === item.url || (item.url !== '/' && location.pathname.startsWith(item.url));
                
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive}
                      tooltip={item.title}
                      className={`
                        h-10 text-gray-400 hover:text-white hover:bg-[#7b2cbf]/20 transition-all duration-200
                        ${isActive ? 'bg-[#7b2cbf]/20 text-[#00f5d4] font-bold shadow-[inset_3px_0_0_0_#00f5d4]' : ''}
                      `}
                    >
                      <Link to={item.url}>
                        <item.icon className={isActive ? "text-[#00f5d4] drop-shadow-[0_0_5px_rgba(0,245,212,0.5)]" : ""} />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-[#7b2cbf]/20 p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t('profile')} className="hover:bg-[#7b2cbf]/20 hover:text-white text-gray-300">
                <Link to="/profile">
                    <User />
                    <span>{t('profile')}</span>
                </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          
          <SidebarMenuItem>
            <SidebarMenuButton 
                onClick={handleLogout}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 mt-2"
                tooltip={t('logout')}
            >
              <LogOut />
              <span>{t('logout')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
