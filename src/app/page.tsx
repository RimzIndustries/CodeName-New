
'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Crown, Building2, Swords, Users, ShieldCheck, User, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModeToggle } from '@/components/theme-toggle';

export default function PublicHomePage() {

  const stats = {
    totalUsers: 'Banyak',
    totalAlliances: 'Puluhan',
    totalProvinces: 'Beragam',
  };

  return (
    <div className="flex flex-col min-h-dvh bg-background text-foreground font-body">
      <header className="container mx-auto flex h-20 items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2" prefetch={false}>
          <Crown className="h-8 w-8 text-primary" />
          <span className="text-2xl font-headline text-primary">Code Name</span>
        </Link>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/login">Masuk</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Daftar</Link>
          </Button>
          <ModeToggle />
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="w-full py-12 md:py-24 lg:py-32 bg-muted/20">
            <div className="container px-4 md:px-6">
                <div className="grid gap-6 lg:grid-cols-[1fr_400px] lg:gap-12 xl:grid-cols-[1fr_600px]">
                    <div className="flex flex-col justify-center space-y-4">
                        <div className="space-y-2">
                            <h1 className="text-3xl tracking-tighter sm:text-4xl xl:text-5xl/none font-headline text-primary">
                                Bangun Kerajaanmu, Taklukkan Negeri
                            </h1>
                            <p className="max-w-[600px] text-muted-foreground md:text-lg">
                                Bergabunglah dalam dunia strategi berbasis teks yang dinamis. Kelola sumber daya, latih pasukan, dan bentuk aliansi untuk mengukir namamu dalam sejarah.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 min-[400px]:flex-row">
                            <Button asChild size="lg">
                                <Link href="/register">Daftar Sekarang</Link>
                            </Button>
                            <Button asChild variant="outline" size="lg">
                                <Link href="/login">Masuk ke Akun</Link>
                            </Button>
                        </div>
                    </div>
                    <div className="hidden lg:flex items-center justify-center">
                        <Crown className="h-48 w-48 text-primary/10" strokeWidth={0.5} />
                    </div>
                </div>
            </div>
        </section>
        
        {/* Features Section */}
        <section className="w-full py-12 md:py-24">
            <div className="container px-4 md:px-6">
                <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
                     <h2 className="text-2xl tracking-tighter sm:text-4xl font-headline text-primary">Tiga Pilar Kekuasaan</h2>
                     <p className="max-w-[900px] text-muted-foreground md:text-lg/relaxed lg:text-base/relaxed xl:text-lg/relaxed">
                        Kuasai tiga aspek fundamental untuk menjadi penguasa terhebat di negeri ini.
                     </p>
                </div>
                <div className="mx-auto grid items-start gap-8 sm:max-w-4xl sm:grid-cols-2 md:gap-12 lg:max-w-5xl lg:grid-cols-3">
                    <Card>
                        <CardHeader className="flex flex-row items-center gap-4">
                             <Building2 className="w-8 h-8 text-primary" />
                             <CardTitle>Bangun & Kembangkan</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Dirikan bangunan, kelola sumber daya (uang, makanan, tanah), dan kembangkan populasi untuk memperkuat kerajaanmu.</p>
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader className="flex flex-row items-center gap-4">
                             <Swords className="w-8 h-8 text-primary" />
                             <CardTitle>Latih & Bertempur</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <p className="text-sm text-muted-foreground">Latih berbagai jenis pasukan dengan kekuatan unik. Kirim mereka untuk menyerang lawan dan mempertahankan wilayahmu.</p>
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader className="flex flex-row items-center gap-4">
                            <Users className="w-8 h-8 text-primary" />
                             <CardTitle>Bentuk Aliansi</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <p className="text-sm text-muted-foreground">Bergabunglah dengan pemain lain, pilih pemimpin melalui pemungutan suara, dan bekerja sama untuk mendominasi peta kekuasaan.</p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </section>

        {/* Stats Section */}
        <section className="w-full py-12 md:py-24 bg-muted/20">
            <div className="container px-4 md:px-6">
                <div className="flex flex-col items-center justify-center space-y-4 text-center">
                     <h2 className="text-2xl tracking-tighter sm:text-4xl font-headline text-primary">Dunia yang Hidup</h2>
                     <p className="max-w-[900px] text-muted-foreground md:text-lg/relaxed lg:text-base/relaxed xl:text-lg/relaxed">
                        Peta kekuasaan terus berubah. Bergabunglah dengan ribuan pemain lain.
                     </p>
                </div>
                <div className="mx-auto grid max-w-5xl grid-cols-1 sm:grid-cols-3 gap-6 py-12">
                     <Card>
                        <CardContent className="p-6 flex flex-col items-center justify-center gap-2">
                            <User className="w-10 h-10 text-primary" />
                            <p className="text-3xl">{stats.totalUsers}</p>
                            <p className="text-sm text-muted-foreground">Pemain Aktif</p>
                        </CardContent>
                     </Card>
                     <Card>
                         <CardContent className="p-6 flex flex-col items-center justify-center gap-2">
                            <ShieldCheck className="w-10 h-10 text-primary" />
                            <p className="text-3xl">{stats.totalAlliances}</p>
                            <p className="text-sm text-muted-foreground">Aliansi Terbentuk</p>
                        </CardContent>
                     </Card>
                     <Card>
                         <CardContent className="p-6 flex flex-col items-center justify-center gap-2">
                            <Globe className="w-10 h-10 text-primary" />
                            <p className="text-3xl">{stats.totalProvinces}</p>
                            <p className="text-sm text-muted-foreground">Provinsi Dikuasai</p>
                        </CardContent>
                     </Card>
                </div>
            </div>
        </section>

      </main>

      <footer className="flex items-center justify-center p-6 md:p-8 border-t">
          <p className="text-xs text-muted-foreground">&copy; 2024 Code Name. Hak cipta dilindungi undang-undang.</p>
      </footer>
    </div>
  );
}
