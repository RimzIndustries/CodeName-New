
'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Menu, Coins, Heart, MapPin, Building2, BarChart3, Users, Swords, LogOut, Crown, Settings, Bell, Globe } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ModeToggle } from '@/components/theme-toggle';


export default function UserDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && (!user || (userProfile?.role !== 'user' && userProfile?.role !== 'admin') )) {
      router.push('/login');
    }
  }, [user, userProfile, loading, router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  if (loading || !user || !userProfile) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4">
                <Crown className="h-12 w-12 animate-pulse text-primary" />
                <p className="text-muted-foreground">Memuat Pride...</p>
            </div>
        </div>
    );
  }

  const bottomNavItems = [
    { href: "/userdashboard", icon: BarChart3, label: "Info" },
    { href: "/userdashboard/buildings", icon: Building2, label: "Bangunan" },
    { href: "/userdashboard/barracks", icon: Shield, label: "Barak" },
    { href: "/userdashboard/command", icon: Swords, label: "Komando" },
    { href: "/userdashboard/alliance", icon: Users, label: "Aliansi" },
    { href: "/userdashboard/world", icon: Globe, label: "Dunia" },
  ]

  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
      <div className="flex flex-col sm:gap-4 sm:py-4 sm:pl-14">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
          <div className="flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" />
            <h1 className="text-lg tracking-wider">Code Name</h1>
          </div>
          
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon">
                <Link href="/userdashboard/reports">
                    <Bell className="h-5 w-5" />
                    <span className="sr-only">Laporan</span>
                </Link>
            </Button>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                        <Menu className="h-6 w-6" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>{userProfile.prideName}</DropdownMenuLabel>
                    {userProfile.role === 'admin' && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link href="/admindashboard">
                            <Crown className="mr-2 h-4 w-4" />
                            <span>Admin Dashboard</span>
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                     <DropdownMenuItem asChild>
                      <Link href="/userdashboard/alliance">
                        <Users className="mr-2 h-4 w-4" />
                        <span>Aliansi Saya</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/userdashboard/settings">
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Pengaturan Akun</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout}>
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Keluar</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <div className='p-2'>
                        <ModeToggle />
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>
          </div>

        </header>

        {/* Main Content */}
        <main className="flex-1 space-y-4 p-4 sm:px-6 sm:pt-0 md:space-y-8 pb-28 sm:pb-24">
          {/* Resource Bar */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-card/50">
              <CardContent className="p-4 flex items-center justify-center gap-3">
                <Coins className="h-6 w-6 text-primary" />
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Uang</p>
                  <p className="text-lg">{Math.floor(userProfile.money ?? 0).toLocaleString()} uFtB</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50">
              <CardContent className="p-4 flex items-center justify-center gap-3">
                <Heart className="h-6 w-6 text-primary" />
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Makanan</p>
                  <p className="text-lg">{Math.floor(userProfile.food ?? 0).toLocaleString()} mFtB</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50">
              <CardContent className="p-4 flex items-center justify-center gap-3">
                <MapPin className="h-6 w-6 text-primary" />
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Tanah</p>
                  <p className="text-lg">{(userProfile.land ?? 0).toLocaleString()} tFtB</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {children}
        </main>
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm">
        <div className="grid h-16 grid-cols-6 items-center justify-items-center gap-1 px-1">
            {bottomNavItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                    <Button asChild key={item.href} variant="ghost" className={`flex flex-col h-auto p-1.5 w-full text-center ${isActive ? 'bg-card' : ''}`}>
                        <Link href={item.href}>
                            <item.icon className={`h-5 w-5 mb-1 ${isActive ? 'text-primary' : ''}`} />
                            <span className={`text-[10px] leading-tight ${isActive ? 'text-primary' : ''}`}>{item.label}</span>
                        </Link>
                    </Button>
                );
            })}
        </div>
      </nav>
    </div>
  );
}
