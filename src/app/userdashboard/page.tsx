
'use client';

import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Crown, Coins, Heart } from 'lucide-react';
import { useEffect, useState } from 'react';
import { doc, getDoc, collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Progress } from '@/components/ui/progress';

// Interface untuk gelar, dicocokkan dengan data di Firestore
interface GameTitle {
  id: string;
  name: string;
  prideRequired: number;
  attackBonus: number;
  defenseBonus: number;
  resourceBonus: number;
}

interface BuildingEffects {
  residence: { unemployed: number; capacity: number };
  farm: { unemployed: number; food: number };
  fort: { unemployed: number; defenseBonus: number };
  university: { unemployed: number; eliteBonus: number; constructionBonus: number };
  barracks: { unemployed: number; trainingBonus: number };
  mobility: { unemployed: number; attackBonus: number };
  tambang: { unemployed: number; money: number };
}

export default function UserDashboardPage() {
  const { userProfile, loading } = useAuth();
  const [countdown, setCountdown] = useState('');
  const [allianceName, setAllianceName] = useState<string | null>(null);

  // State untuk gelar
  const [titles, setTitles] = useState<GameTitle[]>([]);
  const [currentTitle, setCurrentTitle] = useState<GameTitle | null>(null);
  const [nextTitle, setNextTitle] = useState<GameTitle | null>(null);
  const [titleProgress, setTitleProgress] = useState(0);
  const [isLoadingTitles, setIsLoadingTitles] = useState(true);
  
  // State for admin message
  const [adminMessage, setAdminMessage] = useState<string>('');
  const [isLoadingMessage, setIsLoadingMessage] = useState(true);
  
  // State for game settings for display
  const [hourlyMoneyBonus, setHourlyMoneyBonus] = useState(0);
  const [hourlyFoodBonus, setHourlyFoodBonus] = useState(0);
  const [buildingEffects, setBuildingEffects] = useState<Partial<BuildingEffects>>({});
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);


  useEffect(() => {
    const calculateCountdown = () => {
      const now = new Date();
      
      // Tentukan hari pertama bulan berikutnya
      const firstOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      
      // Hitung sisa waktu
      const remainingMillis = firstOfNextMonth.getTime() - now.getTime();

      if (remainingMillis <= 0) {
          setCountdown("Pergantian zaman telah tiba!");
          return;
      }

      // Format sisa waktu untuk hanya menampilkan hari
      const totalSeconds = Math.floor(remainingMillis / 1000);
      const days = Math.floor(totalSeconds / (3600 * 24));

      setCountdown(
          `Menuju Pergantian Zaman: ${days} hari`
      );
    };

    calculateCountdown(); // Panggilan awal
    const timerId = setInterval(calculateCountdown, 1000); // Perbarui setiap detik

    return () => clearInterval(timerId); // Bersihkan interval
  }, []);

  useEffect(() => {
    if (userProfile?.allianceId) {
        const allianceDocRef = doc(db, 'alliances', userProfile.allianceId!);
        const unsubscribe = onSnapshot(allianceDocRef, (allianceDocSnap) => {
            if (allianceDocSnap.exists()) {
                setAllianceName(allianceDocSnap.data().name);
            } else {
                console.log("Alliance not found for ID:", userProfile.allianceId);
                setAllianceName(null);
            }
        }, (error) => {
            console.error("Error fetching alliance:", error);
            setAllianceName(null);
        });
        return () => unsubscribe();
    } else {
        setAllianceName(null);
    }
  }, [userProfile?.allianceId]);

  // Mengambil daftar gelar dari Firestore
  useEffect(() => {
    setIsLoadingTitles(true);
    const titlesCollectionRef = collection(db, 'titles');
    
    const unsubscribe = onSnapshot(titlesCollectionRef, (snapshot) => {
      const titlesList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as GameTitle[];
      
      // Urutkan berdasarkan pride yang dibutuhkan (terendah ke tertinggi) untuk memudahkan pencarian gelar berikutnya
      titlesList.sort((a, b) => a.prideRequired - b.prideRequired);
      setTitles(titlesList);
      setIsLoadingTitles(false);
    }, (error) => {
      console.error("Error fetching titles:", error);
      setIsLoadingTitles(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch admin message and game settings
  useEffect(() => {
    setIsLoadingMessage(true);
    setIsLoadingSettings(true);
    
    const unsubFns: (()=>void)[] = [];

    const infoDocRef = doc(db, 'game-settings', 'admin-info');
    unsubFns.push(onSnapshot(infoDocRef, (docSnap) => {
        if (docSnap.exists() && docSnap.data().message) {
            setAdminMessage(docSnap.data().message);
        } else {
            setAdminMessage(''); 
        }
        setIsLoadingMessage(false);
    }, (error) => {
        console.error("Error fetching admin message:", error);
        setAdminMessage('');
        setIsLoadingMessage(false);
    }));

    const bonusesDocRef = doc(db, 'game-settings', 'global-bonuses');
    unsubFns.push(onSnapshot(bonusesDocRef, (docSnap) => {
        if(docSnap.exists()){
            setHourlyMoneyBonus(docSnap.data().money ?? 0);
            setHourlyFoodBonus(docSnap.data().food ?? 0);
        }
        setIsLoadingSettings(false);
    }));

    const effectsDocRef = doc(db, 'game-settings', 'building-effects');
    unsubFns.push(onSnapshot(effectsDocRef, (docSnap) => {
        if(docSnap.exists()){
            setBuildingEffects(docSnap.data());
        }
        setIsLoadingSettings(false);
    }));

    return () => unsubFns.forEach(fn => fn());
  }, []);

  // Menentukan gelar saat ini, berikutnya, dan progress
  useEffect(() => {
    if (userProfile && titles.length > 0) {
      const userPride = userProfile.pride ?? 0;

      // Temukan gelar tertinggi yang telah dicapai pengguna.
      // Karena gelar diurutkan menaik, kita temukan yang terakhir yang memenuhi syarat.
      const achievedTitle = [...titles].reverse().find(title => userPride >= title.prideRequired) || null;
      setCurrentTitle(achievedTitle);
      
      // Temukan gelar berikutnya. Ini adalah yang pertama yang TIDAK mereka penuhi.
      const nextAchievableTitle = titles.find(title => userPride < title.prideRequired) || null;
      setNextTitle(nextAchievableTitle);

      if (nextAchievableTitle) {
        // Ada gelar berikutnya yang harus dituju
        const prideForCurrent = achievedTitle?.prideRequired ?? 0;
        const prideForNext = nextAchievableTitle.prideRequired;
        
        const totalRange = prideForNext - prideForCurrent;
        const currentProgressInRange = userPride - prideForCurrent;

        if (totalRange > 0) {
          setTitleProgress(Math.min((currentProgressInRange / totalRange) * 100, 100));
        } else {
           setTitleProgress(0);
        }
      } else if (achievedTitle) {
        // Pengguna memiliki gelar tertinggi
        setTitleProgress(100);
      } else {
        // Belum ada gelar yang dicapai, mengincar yang pertama
        const firstTitle = titles[0];
        if (firstTitle) {
             const prideForNext = firstTitle.prideRequired;
             if (prideForNext > 0) {
                setTitleProgress((userPride / prideForNext) * 100);
             } else {
                setTitleProgress(100);
             }
        } else {
            setTitleProgress(0); // Tidak ada gelar dalam permainan
        }
      }

    } else if (userProfile && !isLoadingTitles) {
        // Jika tidak ada gelar yang tersedia atau dimuat, pastikan tidak ada gelar yang ditampilkan
        setCurrentTitle(null);
        setNextTitle(null);
        setTitleProgress(0);
    }
  }, [userProfile, userProfile?.pride, titles, isLoadingTitles]);


  if (loading || !userProfile) {
    return null; // Layout akan menampilkan status loading
  }

  const moneyFromTambang = (userProfile.buildings?.tambang ?? 0) * (buildingEffects.tambang?.money ?? 0);
  const foodFromFarm = (userProfile.buildings?.farm ?? 0) * (buildingEffects.farm?.food ?? 0);
  const totalMoneyBonus = hourlyMoneyBonus + moneyFromTambang;
  const totalFoodBonus = hourlyFoodBonus + foodFromFarm;

  return (
    <div className="space-y-4">
        {/* Info Provinsi */}
        <Card>
          <CardHeader className="p-4 text-center">
            <p className="text-sm text-muted-foreground">
              {countdown || 'Menghitung waktu...'}
            </p>
            <CardTitle className="text-3xl text-primary">
              {userProfile.prideName}{' '}
              <span className="text-xl text-accent">
                [{isLoadingTitles ? '...' : currentTitle?.name ?? 'Tanpa Gelar'} {userProfile.province}]
              </span>
              {allianceName && (
                <span className="text-xl text-accent">
                  {' '}[{allianceName}]
                </span>
              )}
            </CardTitle>
          </CardHeader>
        </Card>

        {/* Stats */}
        <Card>
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
            {/* Kolom Kiri - Info Pride */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Gelar</span>
                <span>{isLoadingTitles ? '...' : currentTitle?.name ?? 'Tanpa Gelar'}</span>
              </div>
              <Separator className="bg-border/50"/>
              <div className="flex justify-between items-center"><span className="text-muted-foreground">Pride</span><span>{(userProfile.pride ?? 0).toLocaleString()}</span></div>
              <Separator className="bg-border/50"/>
               {allianceName ? (
                <>
                  <div className="flex justify-between items-center"><span className="text-muted-foreground">Aliansi</span><span className="text-accent">{allianceName}</span></div>
                  <Separator className="bg-border/50"/>
                </>
              ) : (
                 <>
                  <div className="flex justify-between items-center"><span className="text-muted-foreground">Aliansi</span><span>Tidak ada</span></div>
                  <Separator className="bg-border/50"/>
                </>
              )}
              <div className="flex justify-between items-center"><span className="text-muted-foreground">Provinsi</span><span className="text-primary">{userProfile.province}</span></div>
              <Separator className="bg-border/50"/>
              <div className="flex justify-between items-center"><span className="text-muted-foreground">Zodiac</span><span className="text-primary">{userProfile.zodiac}</span></div>
            </div>
            {/* Kolom Kanan - Sumber Daya & Militer */}
            <div className="space-y-2">
              <div className="flex justify-between items-center"><span className="text-muted-foreground">Tanah</span><span>{(userProfile.land ?? 0).toLocaleString()} tFtB</span></div>
              <Separator className="bg-border/50"/>
              <div className="flex justify-between items-center"><span className="text-muted-foreground">Uang</span><span>{Math.floor(userProfile.money ?? 0).toLocaleString()} uFtB</span></div>
              <Separator className="bg-border/50"/>
              <div className="flex justify-between items-center"><span className="text-muted-foreground">Makanan</span><span>{Math.floor(userProfile.food ?? 0).toLocaleString()} mFtB</span></div>
              <Separator className="bg-border/50"/>
              <div className="flex justify-between items-center"><span className="text-muted-foreground">Pengangguran</span><span>{(userProfile.unemployed ?? 0).toLocaleString()}</span></div>
               <Separator className="bg-border/50"/>
              <div className="flex justify-between items-center"><span className="text-muted-foreground">Total Pasukan</span><span>{((userProfile.units?.attack ?? 0) + (userProfile.units?.defense ?? 0) + (userProfile.units?.elite ?? 0) + (userProfile.units?.raider ?? 0) + (userProfile.units?.spy ?? 0)).toLocaleString()}</span></div>
            </div>
          </CardContent>
        </Card>

        {/* Bonus & Effects Card */}
        <Card>
            <CardHeader className="p-4">
                <CardTitle className="text-lg">Bonus & Efek per Jam</CardTitle>
            </CardHeader>
            <CardContent className="p-4 text-sm space-y-2">
                {isLoadingSettings ? (
                    <p>Memuat bonus...</p>
                ) : (
                    <>
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground flex items-center gap-2"><Coins className="h-4 w-4" /> Bonus Uang</span>
                            <span>{totalMoneyBonus.toLocaleString()} uFtB</span>
                        </div>
                        <p className="text-xs text-muted-foreground pl-6">Global: {hourlyMoneyBonus.toLocaleString()} + Bangunan: {moneyFromTambang.toLocaleString()}</p>
                        <Separator className="my-2"/>
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground flex items-center gap-2"><Heart className="h-4 w-4" /> Bonus Makanan</span>
                            <span>{totalFoodBonus.toLocaleString()} mFtB</span>
                        </div>
                        <p className="text-xs text-muted-foreground pl-6">Global: {hourlyFoodBonus.toLocaleString()} + Bangunan: {foodFromFarm.toLocaleString()}</p>
                    </>
                )}
            </CardContent>
        </Card>

        {/* Gelar Pride */}
        <Card>
          <CardContent className="p-4 space-y-2">
             <div className="flex justify-between items-baseline">
                <p>
                  Gelar saat ini: <span className="text-accent text-2xl">{isLoadingTitles ? '...' : currentTitle?.name ?? 'Tanpa Gelar'}</span>
                </p>
                <p>
                  Selanjutnya: <span className="text-accent text-2xl">{isLoadingTitles ? '...' : nextTitle?.name ?? 'Gelar Tertinggi'}</span>
                </p>
             </div>

             <div className="space-y-1 pt-2">
                {isLoadingTitles ? (
                    <div className="h-4 bg-muted rounded-full animate-pulse" />
                ) : nextTitle ? (
                    <>
                        <Progress value={titleProgress} className="h-2" />
                        <p className="text-xs text-muted-foreground text-center">
                           Menuju {nextTitle.name} ({(userProfile.pride ?? 0).toLocaleString()} / {nextTitle.prideRequired.toLocaleString()})
                        </p>
                    </>
                ) : currentTitle ? (
                    <>
                        <Progress value={100} className="h-2" />
                        <p className="text-xs text-muted-foreground text-center">
                            Gelar tertinggi telah tercapai!
                        </p>
                    </>
                ) : (
                   <p className="text-xs text-muted-foreground text-center">
                        Tidak ada gelar yang tersedia.
                   </p>
                )}
            </div>
             
             <p className="text-xs text-muted-foreground text-center pt-2">
                Attack: +{currentTitle?.attackBonus ?? 0}%, Defense: +{currentTitle?.defenseBonus ?? 0}%, Resource: +{currentTitle?.resourceBonus ?? 0}%
             </p>
          </CardContent>
        </Card>

        {/* Ritual Info */}
        <Card>
          <CardContent className="p-4 text-center text-sm">
            {isLoadingMessage ? (
              <p>Memuat informasi...</p>
            ) : (
              <p className="whitespace-pre-wrap">{adminMessage || 'Tidak ada informasi dari admin saat ini.'}</p>
            )}
          </CardContent>
        </Card>
    </div>
  );
}

    