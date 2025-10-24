
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Crown } from 'lucide-react';
import { ModeToggle } from '@/components/theme-toggle';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast({
        title: "Masuk Berhasil",
        description: "Mengarahkan ke dasbor Anda...",
      });
      // AuthProvider will handle redirection
    } catch (error: any) {
      let description = "Terjadi kesalahan tak terduga saat mencoba masuk.";
      let isHandledError = false;

      switch (error.code) {
        case 'auth/invalid-credential':
        case 'auth/invalid-email':
          description = "Email atau kata sandi salah. Pastikan Anda telah mendaftar dan kredensial Anda benar.";
          isHandledError = true;
          break;
        case 'auth/too-many-requests':
          description = "Akses ke akun ini telah dinonaktifkan sementara karena terlalu banyak upaya masuk yang gagal. Silakan coba lagi nanti.";
          isHandledError = true;
          break;
        case 'auth/invalid-api-key':
            description = "Kunci API Firebase tidak valid. Harap periksa konfigurasi Anda.";
            isHandledError = true;
            break;
      }
      
      if (!isHandledError) {
        console.error("Login failed:", error);
      }

      toast({
        title: "Kesalahan Masuk",
        description: description,
        variant: "destructive",
      });
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsResetting(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      toast({
        title: "Email Reset Terkirim",
        description: `Jika akun untuk ${resetEmail} ada, kami telah mengirimkan tautan untuk mengatur ulang kata sandi Anda.`,
      });
      setIsDialogOpen(false);
      setResetEmail('');
    } catch (error: any) {
      console.error("Password reset failed:", error);
      toast({
        title: "Gagal Mengirim Email",
        description: "Terjadi kesalahan. Pastikan format email benar dan coba lagi nanti.",
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };


  return (
    <div className="relative flex items-center justify-center min-h-screen bg-background">
      <div className="absolute top-4 right-4">
        <ModeToggle />
      </div>
      <div className="w-full max-w-md p-4">
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <Card className="mx-auto max-w-sm">
            <CardHeader>
              <div className="flex justify-center mb-4">
                <Link href="/" className="flex items-center gap-2">
                  <Crown className="h-8 w-8 text-primary" />
                  <span className="text-xl font-headline text-primary">Code Name</span>
                </Link>
              </div>
              <CardTitle className="text-2xl font-headline text-center">Masuk</CardTitle>
              <CardDescription className="text-center font-body">
                Masukkan email Anda di bawah ini untuk masuk ke akun Anda
              </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleLogin}>
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="m@example.com"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <div className="flex items-center">
                        <Label htmlFor="password">Kata Sandi</Label>
                        <DialogTrigger asChild>
                           <Button variant="link" type="button" className="ml-auto inline-block h-auto p-0 text-sm underline">
                            Lupa Sandi?
                          </Button>
                        </DialogTrigger>
                      </div>
                      <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    <Button type="submit" className="w-full">
                      Masuk
                    </Button>
                  </div>
                </form>
              <div className="mt-4 text-center text-sm font-body">
                Belum punya akun?{' '}
                <Link href="/register" className="underline">
                  Daftar
                </Link>
              </div>
              <div className="mt-2 text-center text-sm font-body">
                <Link href="/" className="underline">
                  Kembali ke Home
                </Link>
              </div>
            </CardContent>
          </Card>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Atur Ulang Kata Sandi</DialogTitle>
              <DialogDescription>
                Masukkan alamat email Anda. Kami akan mengirimkan tautan untuk mengatur ulang kata sandi Anda.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handlePasswordReset}>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="reset-email" className="text-left">Email</Label>
                        <Input
                            id="reset-email"
                            type="email"
                            placeholder="m@example.com"
                            required
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
                    <Button type="submit" disabled={isResetting}>
                        {isResetting ? 'Mengirim...' : 'Kirim Tautan Reset'}
                    </Button>
                </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
