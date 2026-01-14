import React from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
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
  Users
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
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error("Erreur déconnexion", error);
    }
  };

  const items = [
    { title: "Dashboard", url: "/", icon: LayoutDashboard },
    { title: "Exercices", url: "/exercises", icon: Dumbbell },
    { title: "Repas", url: "/meals", icon: Utensils },
    { title: "Séance", url: "/session", icon: Timer },
    { title: "Performances", url: "/performance", icon: LineChart },
    { title: "Galerie", url: "/gallery", icon: ImageIcon },
    { title: "Messages", url: "/messages", icon: MessageSquare },
    { title: "Défis", url: "/challenges", icon: Trophy },
    { title: "Communauté", url: "/community", icon: Users },
  ];

  return (
    <Sidebar className="border-r border-[#7b2cbf]/30 bg-[#0a0a0f]/95 text-white" collapsible="icon">
      
      {/* HEADER : Ton Logo Kaybee Fitness */}
      <SidebarHeader className="h-20 flex justify-center items-center border-b border-[#7b2cbf]/20">
         <div className="flex items-center gap-2 px-2 w-full overflow-hidden transition-all">
             <img 
               src="https://firebasestorage.googleapis.com/v0/b/kaybee-fitness.firebasestorage.app/o/Logo%20.png?alt=media&token=8d0e94d1-3989-4894-b249-10f5945cf172" 
               alt="Logo" 
               className="h-10 w-auto object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]"
             />
             <span className="font-bold text-lg whitespace-nowrap group-data-[collapsible=icon]:hidden text-[#00f5d4]">
                Kaybee Fitness
             </span>
         </div>
      </SidebarHeader>

      {/* MENU */}
      <SidebarContent className="py-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive = location.pathname === item.url || (item.url !== '/' && location.pathname.startsWith(item.url));
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive}
                      tooltip={item.title}
                      className={`
                        h-12 text-gray-400 hover:text-white hover:bg-[#7b2cbf]/20 transition-all duration-200
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

      {/* FOOTER : Profil & Déconnexion */}
      <SidebarFooter className="border-t border-[#7b2cbf]/20 p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Profil" className="hover:bg-[#7b2cbf]/20 hover:text-white text-gray-300">
                <Link to="/profile">
                    <User />
                    <span>Mon Profil</span>
                </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          
          <SidebarMenuItem>
            <SidebarMenuButton 
                onClick={handleLogout}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 mt-2"
                tooltip="Déconnexion"
            >
              <LogOut />
              <span>Déconnexion</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}