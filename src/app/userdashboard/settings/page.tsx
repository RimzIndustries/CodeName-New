
'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, deleteUser } from 'firebase/auth';
import { doc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Eye, EyeOff } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [deleteConfirmPassword, setDeleteConfirmPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;
    if (newPassword !== confirmPassword) {
      toast({ title: 'Kata Sandi Tidak Cocok', description: 'Kata sandi baru dan konfirmasi tidak sama.', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: 'Kata Sandi Terlalu Lemah', description: 'Kata sandi harus terdiri dari minimal 6 karakter.', variant: 'destructive' });
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      toast({ title: 'Berhasil!', description: 'Kata sandi Anda telah berhasil diperbarui.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      let description = 'Terjadi kesalahan yang tidak terduga. Silakan coba lagi.';
      let isHandledError = false;
      
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        description = 'Kata sandi saat ini yang Anda masukkan salah.';
        isHandledError = true;
      }
      
      if (!isHandledError) {
          console.error("Password change failed:", error);
      }
      
      toast({ title: 'Gagal Memperbarui Kata Sandi', description, variant: 'destructive' });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || !user.email) return;
    setIsDeleting(true);

    try {
      // Re-authenticate before sensitive operation
      const credential = EmailAuthProvider.credential(user.email, deleteConfirmPassword);
      await reauthenticateWithCredential(user, credential);
      
      // Delete Firestore document first
      await deleteDoc(doc(db, 'users', user.uid));
      
      // Then delete the auth user
      await deleteUser(user);

      toast({ title: 'Akun Dihapus', description: 'Akun dan semua data Anda telah dihapus secara permanen.' });
      router.push('/'); // Redirect to landing page
    } catch (error: any) {
        let description = 'Terjadi kesalahan yang tidak terduga. Silakan coba lagi.';
        let isHandledError = false;

        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            description = 'Penghapusan gagal. Kata sandi yang Anda masukkan salah. Silakan coba lagi.';
            isHandledError = true;
        } else if (error.code === 'permission-denied') {
            description = "Gagal menghapus data: Izin ditolak. Ini kemungkinan besar karena masalah Aturan Keamanan Firestore. Hubungi admin atau perbarui aturan di Firebase Console.";
            isHandledError = true;
        }

        if (!isHandledError) {
            console.error("Account deletion failed:", error);
        }
        
        toast({ title: 'Gagal Menghapus Akun', description, variant: 'destructive' });
        setIsDeleting(false);
    }
    // No need for finally block here, as we redirect on success.
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ubah Kata Sandi</CardTitle>
          <CardDescription>Perbarui kata sandi Anda di sini. Setelah berhasil, Anda mungkin perlu masuk kembali.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Kata Sandi Saat Ini</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2 relative">
              <Label htmlFor="new-password">Kata Sandi Baru</Label>
               <Input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-7 h-7 w-7"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="sr-only">Toggle password visibility</span>
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Konfirmasi Kata Sandi Baru</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={isUpdatingPassword} className="w-full sm:w-auto">
              {isUpdatingPassword ? 'Memperbarui...' : 'Ubah Kata Sandi'}
            </Button>
          </form>
        </CardContent>
      </Card>
      
      <Separator />

      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Area Berbahaya</CardTitle>
          <CardDescription>Tindakan di bawah ini bersifat permanen dan tidak dapat diurungkan.</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Hapus Akun</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apakah Anda benar-benar yakin?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tindakan ini tidak dapat dibatalkan. Ini akan menghapus akun Anda dan semua data permainan terkait secara permanen.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2 py-2">
                 <Label htmlFor="delete-confirm-password">Untuk konfirmasi, masukkan kata sandi Anda:</Label>
                 <Input
                    id="delete-confirm-password"
                    type="password"
                    value={deleteConfirmPassword}
                    onChange={(e) => setDeleteConfirmPassword(e.target.value)}
                    required
                 />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || !deleteConfirmPassword}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting ? 'Menghapus...' : 'Hapus Akun Saya Secara Permanen'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

    