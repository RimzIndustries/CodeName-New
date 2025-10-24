
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
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const zodiacSigns = [ "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces" ];
const provinces = [ "Aceh", "Sumatera Utara", "Sumatera Barat", "Riau", "Kepulauan Riau", "Jambi", "Bengkulu", "Sumatera Selatan", "Kepulauan Bangka Belitung", "Lampung", "Banten", "DKI Jakarta", "Jawa Barat", "Jawa Tengah", "DI Yogyakarta", "Jawa Timur", "Bali", "Nusa Tenggara Barat", "Nusa Tenggara Timur", "Kalimantan Barat", "Kalimantan Tengah", "Kalimantan Selatan", "Kalimantan Timur", "Kalimantan Utara", "Gorontalo", "Sulawesi Barat", "Sulawesi Selatan", "Sulawesi Tengah", "Sulawesi Tenggara", "Sulawesi Utara", "Maluku", "Maluku Utara", "Papua", "Papua Barat", "Papua Barat Daya", "Papua Pegunungan", "Papua Selatan", "Papua Tengah", "Luar Negeri" ];


export default function RegisterPage() {
  const [prideName, setPrideName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [zodiac, setZodiac] = useState('');
  const [province, setProvince] = useState('');
  const router = useRouter();
  const { toast } = useToast();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!prideName) {
        toast({
            title: "Nama Pride Diperlukan",
            description: "Silakan masukkan nama untuk pride Anda.",
            variant: "destructive",
        });
        return;
    }

    if (!zodiac || !province) {
        toast({
            title: "Pilihan Diperlukan",
            description: "Silakan pilih zodiak dan provinsi Anda.",
            variant: "destructive",
        });
        return;
    }

    try {
      // Create user in Firebase Auth first
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Assign role based on email. This is where admin authorization is determined.
      const role = email.toLowerCase() === 'rimzindustries@gmail.com' ? 'admin' : 'user';

      // --- Prepare user data based on role ---
      let assignedAllianceId: string | null = null;
      let userCoordinates = { x: 0, y: 0 };
      let initialMoney = 0, initialFood = 0, initialLand = 0, initialPride = 0, initialUnemployed = 0;

      if (role === 'user') {
        // Fetch initial game settings for new users
        const settingsDocRef = doc(db, 'game-settings', 'initial-resources');
        const settingsDocSnap = await getDoc(settingsDocRef);

        if (settingsDocSnap.exists()) {
          const settingsData = settingsDocSnap.data();
          initialMoney = settingsData.money ?? 1000;
          initialFood = settingsData.food ?? 500;
          initialLand = settingsData.land ?? 100;
          initialUnemployed = settingsData.unemployed ?? 10;
        } else {
          initialMoney = 1000;
          initialFood = 500;
          initialLand = 100;
          initialUnemployed = 10;
        }
        initialPride = 500;
        

        // --- New Alliance Assignment Logic ---
        const alliancesCollectionRef = collection(db, 'alliances');
        const usersCollectionRef = collection(db, 'users');

        const [allianceSnapshot, usersSnapshot] = await Promise.all([
          getDocs(alliancesCollectionRef),
          getDocs(usersCollectionRef),
        ]);

        const memberCounts: Record<string, number> = {};
        usersSnapshot.forEach(userDoc => {
          const allianceId = userDoc.data().allianceId;
          if (allianceId) {
            memberCounts[allianceId] = (memberCounts[allianceId] || 0) + 1;
          }
        });
        
        const allAlliances = allianceSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

        const eligibleAlliances = allAlliances.filter(alliance => (memberCounts[alliance.id] || 0) < 10);
        
        if (eligibleAlliances.length > 0) {
            const assignedAlliance = eligibleAlliances[Math.floor(Math.random() * eligibleAlliances.length)];
            assignedAllianceId = assignedAlliance.id;
            userCoordinates = {
                x: assignedAlliance.coordinates?.x ?? 0,
                y: assignedAlliance.coordinates?.y ?? 0,
            };
        } else {
            // Fallback if no eligible alliances are found
            console.warn("No alliances with < 10 members. Assigning random coordinates.");
            assignedAllianceId = null;
            userCoordinates = {
                x: Math.floor(Math.random() * 201) - 100,
                y: Math.floor(Math.random() * 201) - 100,
            };
        }

      }
      // Admins will have null allianceId, 0,0 coordinates, and 0 for all resources.

      // Create user profile in Firestore with all prepared data
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        prideName: prideName,
        role: role,
        status: 'active',
        money: initialMoney,
        food: initialFood,
        land: initialLand,
        zodiac: zodiac,
        province: province,
        pride: initialPride,
        unemployed: initialUnemployed,
        buildings: { residence: 0, farm: 0, fort: 0, university: 0, barracks: 0, mobility: 0, tambang: 0 },
        units: { attack: 0, defense: 0, elite: 0, raider: 0, spy: 0 },
        lastResourceUpdate: Timestamp.now(),
        allianceId: assignedAllianceId,
        coordinates: userCoordinates,
      });
      
      toast({
        title: "Pendaftaran Berhasil",
        description: "Mengarahkan ke dasbor Anda...",
      });

      // AuthProvider will handle redirection based on role
    } catch (error: any) {
      let description = "Gagal membuat akun. Silakan coba lagi.";
      let isHandledError = false;

      if (error.code === 'auth/email-already-in-use') {
        description = "Email ini sudah terdaftar. Silakan masuk atau gunakan email yang berbeda.";
        isHandledError = true;
      } else if (error.code === 'auth/weak-password') {
        description = "Kata sandi terlalu lemah. Harap berikan kata sandi yang lebih kuat (minimal 6 karakter).";
        isHandledError = true;
      } else if (error.code === 'auth/invalid-email') {
        description = "Format email tidak valid. Silakan periksa kembali email Anda.";
        isHandledError = true;
      } else if (error.code === 'auth/invalid-api-key') {
        description = "Kunci API Firebase tidak valid. Harap periksa konfigurasi Anda.";
        isHandledError = true;
      }

      if (!isHandledError) {
        console.error("Registration failed:", error);
      }
      
      toast({
        title: "Kesalahan Pendaftaran",
        description: description,
        variant: "destructive",
      });
    }
  };


  return (
    <div className="relative flex items-center justify-center min-h-screen bg-background">
        <div className="absolute top-4 right-4">
            <ModeToggle />
        </div>
        <Card className="mx-auto max-w-sm">
            <CardHeader>
                <div className="flex justify-center mb-4">
                    <Link href="/" className="flex items-center gap-2">
                        <Crown className="h-8 w-8 text-primary" />
                        <span className="text-xl font-headline text-primary">Code Name</span>
                    </Link>
                </div>
                <CardTitle className="text-xl text-center font-headline">Buat Pride-mu</CardTitle>
                <CardDescription className="text-center font-body">
                    Masukkan informasimu untuk membuat akun
                </CardDescription>
            </CardHeader>
            <CardContent>
                  <form onSubmit={handleRegister}>
                    <div className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="pride-name">Nama Pride</Label>
                            <Input id="pride-name" placeholder="Lionheart" required value={prideName} onChange={(e) => setPrideName(e.target.value)} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="zodiac">Zodiak</Label>
                            <Select onValueChange={setZodiac} value={zodiac}>
                                <SelectTrigger id="zodiac">
                                    <SelectValue placeholder="Pilih Zodiak..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {zodiacSigns.map((sign) => (
                                        <SelectItem key={sign} value={sign}>{sign}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="province">Provinsi</Label>
                            <Select onValueChange={setProvince} value={province}>
                                <SelectTrigger id="province">
                                    <SelectValue placeholder="Pilih Provinsi..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {provinces.map((prov) => (
                                        <SelectItem key={prov} value={prov}>{prov}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="ruler@example.com"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="password">Kata Sandi</Label>
                            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}/>
                        </div>
                        <Button type="submit" className="w-full">
                            Buat akun
                        </Button>
                    </div>
                  </form>
                <div className="mt-4 text-center text-sm font-body">
                    Sudah punya akun?{" "}
                    <Link href="/login" className="underline">
                        Masuk
                    </Link>
                </div>
                <div className="mt-2 text-center text-sm font-body">
                  <Link href="/" className="underline">
                    Kembali ke Home
                  </Link>
                </div>
            </CardContent>
        </Card>
    </div>
  );
}

    
