
'use client';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ModeToggle } from '@/components/theme-toggle';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useEffect, useState } from 'react';
import { Crown, Trash2, Pencil, Ban, Lightbulb, Swords, Eye } from 'lucide-react';
import { collection, onSnapshot, doc, deleteDoc, getDoc, setDoc, getDocs, writeBatch, addDoc, updateDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { getGameAdvice, type GameAdviceInput, type GameAdviceOutput } from '@/ai/flows/game-advice-flow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Interface untuk data pengguna untuk meningkatkan keamanan tipe
interface DisplayUser {
  id: string;
  prideName: string;
  email: string;
  role: 'admin' | 'user';
  status?: 'active' | 'disabled';
  coordinates?: { x: number; y: number };
  land?: number;
  pride?: number;
  province?: string;
  zodiac?: string;
  allianceId?: string | null;
  [key: string]: any; 
}

// Interfaces for game costs
interface UnitCosts {
    attack: number;
    defense: number;
    elite: number;
    raider: number;
    spy: number;
}

interface BuildingCosts {
    residence: number;
    farm: number;
    fort: number;
    university: number;
    barracks: number;
    mobility: number;
    tambang: number;
}

// Interface for game titles
interface GameTitle {
  id: string;
  name: string;
  prideRequired: number;
  attackBonus: number;
  defenseBonus: number;
  resourceBonus: number;
}

// Interface untuk aliansi
interface Alliance {
  id: string;
  name: string;
  tag: string;
  coordinates: {
    x: number;
    y: number;
  };
  logoUrl?: string;
}

// Interface for building effects
interface BuildingEffects {
  residence: { unemployed: number; capacity: number };
  farm: { unemployed: number; food: number };
  fort: { unemployed: number; defenseBonus: number };
  university: { unemployed: number; eliteBonus: number; constructionBonus: number };
  barracks: { unemployed: number; trainingBonus: number };
  mobility: { unemployed: number; attackBonus: number };
  tambang: { unemployed: number; money: number };
}

interface War {
    id: string;
    alliance1Id: string;
    alliance2Id: string;
    alliance1Name?: string;
    alliance1Tag?: string;
    alliance2Name?: string;
    alliance2Tag?: string;
}

const buildingNameMap: { [key: string]: string } = {
  residence: 'Rumah',
  farm: 'Sawah',
  fort: 'Benteng',
  university: 'Kampus',
  barracks: 'Barak Pasukan',
  mobility: 'Mobilitas Pasukan',
  tambang: 'Tambang'
};

const effectNameMap: { [key: string]: string } = {
  unemployed: 'Pengangguran Dihasilkan',
  capacity: 'Kapasitas Maksimal',
  food: 'Makanan Dihasilkan',
  defenseBonus: 'Bonus Pertahanan (%)',
  eliteBonus: 'Bonus Pasukan Elit (%)',
  trainingBonus: 'Bonus Kecepatan Latih (%)',
  attackBonus: 'Bonus Serangan (%)',
  money: 'Uang Dihasilkan',
  constructionBonus: 'Bonus Kecepatan Konstruksi (%)',
};


export default function AdminDashboardPage() {
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [users, setUsers] = useState<DisplayUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  // State for game settings
  const [initialMoney, setInitialMoney] = useState(1000);
  const [initialFood, setInitialFood] = useState(500);
  const [initialLand, setInitialLand] = useState(100);
  const [initialUnemployed, setInitialUnemployed] = useState(10);
  const [unitCosts, setUnitCosts] = useState<UnitCosts>({ attack: 350, defense: 350, elite: 950, raider: 500, spy: 700 });
  const [buildingCosts, setBuildingCosts] = useState<BuildingCosts>({ residence: 1000, farm: 1200, fort: 2500, university: 5000, barracks: 1500, mobility: 1000, tambang: 2000 });
  const [constructionTime, setConstructionTime] = useState(5); // in hours
  const [trainingTime, setTrainingTime] = useState(2); // in hours
  const [buildingEffects, setBuildingEffects] = useState<BuildingEffects>({
    residence: { unemployed: 20, capacity: 500 },
    farm: { unemployed: 1, food: 100 },
    fort: { unemployed: 2, defenseBonus: 10 },
    university: { unemployed: 2, eliteBonus: 20, constructionBonus: 5 },
    barracks: { unemployed: 5, trainingBonus: 50 },
    mobility: { unemployed: 2, attackBonus: 50 },
    tambang: { unemployed: 2, money: 100 },
  });
  const [votingPowerDivisor, setVotingPowerDivisor] = useState(100);
  const [hourlyMoneyBonus, setHourlyMoneyBonus] = useState(100);
  const [hourlyFoodBonus, setHourlyFoodBonus] = useState(10);
  const [isSavingBonuses, setIsSavingBonuses] = useState(false);


  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingCosts, setIsSavingCosts] = useState(false);
  const [isSavingTime, setIsSavingTime] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isResettingAlliances, setIsResettingAlliances] = useState(false);
  const [isDeletingPlayers, setIsDeletingPlayers] = useState(false);
  const [isSavingEffects, setIsSavingEffects] = useState(false);
  const [isSavingMechanics, setIsSavingMechanics] = useState(false);

  // State for title settings
  const [titles, setTitles] = useState<GameTitle[]>([]);
  const [newTitleName, setNewTitleName] = useState('');
  const [newTitlePride, setNewTitlePride] = useState(0);
  const [newTitleAttack, setNewTitleAttack] = useState(0);
  const [newTitleDefense, setNewTitleDefense] = useState(0);
  const [newTitleResource, setNewTitleResource] = useState(0);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [isLoadingTitles, setIsLoadingTitles] = useState(true);
  
  // State for editing titles
  const [editingTitle, setEditingTitle] = useState<GameTitle | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isUpdatingTitle, setIsUpdatingTitle] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<GameTitle>>({});

  // State for alliance settings
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [newAllianceName, setNewAllianceName] = useState('');
  const [newAllianceTag, setNewAllianceTag] = useState('');
  const [newAllianceX, setNewAllianceX] = useState(0);
  const [newAllianceY, setNewAllianceY] = useState(0);
  const [isSavingAlliance, setIsSavingAlliance] = useState(false);
  const [isLoadingAlliances, setIsLoadingAlliances] = useState(true);

  // State for admin message
  const [adminMessage, setAdminMessage] = useState('');
  const [isSavingMessage, setIsSavingMessage] = useState(false);

  // State for rankings
  const [prideRanking, setPrideRanking] = useState<DisplayUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // State for editing users
  const [editingUser, setEditingUser] = useState<DisplayUser | null>(null);
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [editUserFormData, setEditUserFormData] = useState<Partial<DisplayUser>>({});

  // State for user management search and pagination
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userCurrentPage, setUserCurrentPage] = useState(1);
  const usersPerPage = 10;

  // State for AI advice
  const [aiQuery, setAiQuery] = useState('');
  const [aiResponse, setAiResponse] = useState<GameAdviceOutput | null>(null);
  const [isGettingAdvice, setIsGettingAdvice] = useState(false);
  const [isApplyingChanges, setIsApplyingChanges] = useState(false);
  
  // State for wars
  const [wars, setWars] = useState<War[]>([]);
  const [isLoadingWars, setIsLoadingWars] = useState(true);


  useEffect(() => {
    if (!loading && (!user || userProfile?.role !== 'admin')) {
      router.push('/login');
    }
  }, [user, userProfile, loading, router]);
  
  // Fetch all data on mount if user is admin
  useEffect(() => {
    // Only fetch data if the user is a verified admin.
    if (userProfile?.role !== 'admin') {
      // Set loading states to false to prevent infinite loaders on non-admin access.
      setIsLoadingUsers(false);
      setIsLoadingSettings(false);
      setIsLoadingTitles(false);
      setIsLoadingAlliances(false);
      setIsLoadingWars(false);
      return;
    }

    const fetchData = async () => {
        // Users
        setIsLoadingUsers(true);
        try {
            const usersSnapshot = await getDocs(collection(db, 'users'));
            const userList = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as DisplayUser[];
            setUsers(userList);
        } catch (error) {
            console.error("Error fetching users:", error);
            toast({ title: "Gagal memuat pengguna", variant: "destructive" });
        } finally {
            setIsLoadingUsers(false);
        }

        // Game Settings
        setIsLoadingSettings(true);
        try {
            const settingsDocRef = doc(db, 'game-settings', 'initial-resources');
            const bonusesDocRef = doc(db, 'game-settings', 'global-bonuses');
            const costsDocRef = doc(db, 'game-settings', 'game-costs');
            const timingDocRef = doc(db, 'game-settings', 'timing-rules');
            const effectsDocRef = doc(db, 'game-settings', 'building-effects');
            const mechanicsDocRef = doc(db, 'game-settings', 'game-mechanics');
            const infoDocRef = doc(db, 'game-settings', 'admin-info');

            const [
              settingsDocSnap,
              bonusesDocSnap,
              costsDocSnap,
              timingDocSnap,
              effectsDocSnap,
              mechanicsDocSnap,
              infoDocSnap,
            ] = await Promise.all([
              getDoc(settingsDocRef),
              getDoc(bonusesDocRef),
              getDoc(costsDocRef),
              getDoc(timingDocRef),
              getDoc(effectsDocRef),
              getDoc(mechanicsDocRef),
              getDoc(infoDocRef),
            ]);

            if (settingsDocSnap.exists()) {
              const data = settingsDocSnap.data();
              setInitialMoney(data.money ?? 1000);
              setInitialFood(data.food ?? 500);
              setInitialLand(data.land ?? 100);
              setInitialUnemployed(data.unemployed ?? 10);
            }

            if (bonusesDocSnap.exists()) {
              const data = bonusesDocSnap.data();
              setHourlyMoneyBonus(data.money ?? 100);
              setHourlyFoodBonus(data.food ?? 10);
            }

            if (costsDocSnap.exists()) {
                const data = costsDocSnap.data();
                if (data.units) setUnitCosts(data.units);
                if (data.buildings) setBuildingCosts(data.buildings);
            }

            if (timingDocSnap.exists()) {
                const data = timingDocSnap.data();
                if (data.constructionTimeInHours !== undefined) setConstructionTime(data.constructionTimeInHours);
                if (data.trainingTimeInHours !== undefined) setTrainingTime(data.trainingTimeInHours);
            }
            
            if (effectsDocSnap.exists()) {
                setBuildingEffects(effectsDocSnap.data() as BuildingEffects);
            }

            if (mechanicsDocSnap.exists()) {
                const data = mechanicsDocSnap.data();
                if (data.votingPowerDivisor !== undefined) setVotingPowerDivisor(data.votingPowerDivisor);
            }
            
            if (infoDocSnap.exists()) {
              setAdminMessage(infoDocSnap.data().message ?? '');
            }
        } catch (error) {
            console.error("Error fetching settings:", error);
            toast({ title: "Gagal memuat pengaturan", variant: "destructive" });
        } finally {
            setIsLoadingSettings(false);
        }
        
        // Titles
        setIsLoadingTitles(true);
        try {
            const titlesSnapshot = await getDocs(collection(db, 'titles'));
            const titlesList = titlesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as GameTitle[];
            titlesList.sort((a, b) => a.prideRequired - b.prideRequired);
            setTitles(titlesList);
        } catch (error) {
            console.error("Error fetching titles:", error);
            toast({ title: "Gagal memuat gelar", variant: "destructive" });
        } finally {
            setIsLoadingTitles(false);
        }

        // Alliances
        setIsLoadingAlliances(true);
        try {
            const alliancesSnapshot = await getDocs(collection(db, 'alliances'));
            const allianceList = alliancesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Alliance[];
            setAlliances(allianceList);
        } catch (error) {
            console.error("Error fetching alliances:", error);
            toast({ title: "Gagal memuat aliansi", variant: "destructive" });
        } finally {
            setIsLoadingAlliances(false);
        }

        // Wars
        setIsLoadingWars(true);
        try {
            const warsSnapshot = await getDocs(collection(db, 'wars'));
            const allianceCache = new Map<string, {name: string, tag: string}>();
            const getAllianceInfo = async (allianceId: string) => {
              if (allianceCache.has(allianceId)) return allianceCache.get(allianceId);
              const allianceDoc = await getDoc(doc(db, 'alliances', allianceId));
              if (allianceDoc.exists()) {
                const data = {name: allianceDoc.data().name, tag: allianceDoc.data().tag};
                allianceCache.set(allianceId, data);
                return data;
              }
              return { name: "Aliansi Dibubarkan", tag: "???" };
            };

            const warsList: War[] = await Promise.all(warsSnapshot.docs.map(async (warDoc) => {
                const warData = warDoc.data();
                const [info1, info2] = await Promise.all([
                  getAllianceInfo(warData.participants[0]),
                  getAllianceInfo(warData.participants[1])
                ]);
                return {
                    id: warDoc.id,
                    alliance1Id: warData.participants[0],
                    alliance2Id: warData.participants[1],
                    alliance1Name: info1?.name,
                    alliance1Tag: info1?.tag,
                    alliance2Name: info2?.name,
                    alliance2Tag: info2?.tag,
                };
            }));
            setWars(warsList);
        } catch (error) {
            console.error("Error fetching wars:", error);
            toast({ title: "Gagal memuat data perang", variant: "destructive" });
        } finally {
            setIsLoadingWars(false);
        }
    };

    fetchData();
  }, [userProfile?.role, toast]);
  
  // Calculate rankings
  useEffect(() => {
    if (users.length > 0) {
      const nonAdminUsers = users.filter(u => u.role !== 'admin');

      const filteredResults = searchQuery
        ? nonAdminUsers.filter(u =>
            (u.prideName || '').toLowerCase().includes(searchQuery.toLowerCase())
          )
        : nonAdminUsers;

      const sortedByPride = [...filteredResults].sort((a, b) => (b.pride ?? 0) - (a.pride ?? 0));
      setPrideRanking(sortedByPride);
    }
  }, [users, searchQuery]);
  
  // Derived state for user management table
  const filteredManageableUsers = users.filter(u =>
    (u.prideName || '').toLowerCase().includes(userSearchQuery.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(userSearchQuery.toLowerCase())
  );

  const totalUserPages = Math.ceil(filteredManageableUsers.length / usersPerPage);
  const indexOfLastUser = userCurrentPage * usersPerPage;
  const indexOfFirstUser = indexOfLastUser - usersPerPage;
  const currentUsersToDisplay = filteredManageableUsers.slice(indexOfFirstUser, indexOfLastUser);

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  const handleToggleUserStatus = async (userId: string) => {
    const userDocRef = doc(db, 'users', userId);
    try {
      const userDoc = await getDoc(userDocRef);
      if (!userDoc.exists()) {
        toast({ title: 'Pengguna tidak ditemukan', variant: 'destructive' });
        return;
      }
      
      const currentStatus = userDoc.data().status;
      const newStatus = currentStatus === 'disabled' ? 'active' : 'disabled';
      const actionText = newStatus === 'disabled' ? 'menonaktifkan' : 'mengaktifkan';
      const actionTitle = newStatus === 'disabled' ? 'Pengguna Dinonaktifkan' : 'Pengguna Diaktifkan';

      await updateDoc(userDocRef, { status: newStatus });

      setUsers(users.map(u => u.id === userId ? { ...u, status: newStatus } : u));
      toast({
        title: actionTitle,
        description: `Pengguna telah berhasil ${actionText}.`,
      });
    } catch (error) {
      console.error(`Error toggling user status:`, error);
      toast({
        title: `Gagal mengubah status pengguna`,
        description: `Terjadi kesalahan. Silakan coba lagi.`,
        variant: 'destructive',
      });
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const settingsDocRef = doc(db, 'game-settings', 'initial-resources');
    try {
        await setDoc(settingsDocRef, {
            money: Number(initialMoney),
            food: Number(initialFood),
            land: Number(initialLand),
            unemployed: Number(initialUnemployed),
        }, { merge: true });
        toast({
            title: "Pengaturan Diperbarui",
            description: "Sumber daya awal untuk pengguna baru telah disimpan.",
        });
    } catch (error) {
        console.error("Error updating settings:", error);
        toast({
            title: "Gagal Memperbarui Pengaturan",
            description: "Terjadi kesalahan saat mencoba menyimpan pengaturan.",
            variant: "destructive",
        });
    }
  };

  const handleUpdateBonuses = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBonuses(true);
    const bonusesDocRef = doc(db, 'game-settings', 'global-bonuses');
    try {
        await setDoc(bonusesDocRef, {
            money: Number(hourlyMoneyBonus),
            food: Number(hourlyFoodBonus),
        }, { merge: true });
        toast({
            title: "Bonus Global Diperbarui",
            description: "Pengaturan bonus per jam telah disimpan.",
        });
    } catch (error) {
        console.error("Error updating bonuses:", error);
        toast({
            title: "Gagal Memperbarui Bonus",
            variant: "destructive",
        });
    } finally {
        setIsSavingBonuses(false);
    }
  };

  const handleUpdateCosts = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingCosts(true);
    const costsDocRef = doc(db, 'game-settings', 'game-costs');
    
    const sanitizedUnitCosts = Object.fromEntries(
        Object.entries(unitCosts).map(([key, value]) => [key, isNaN(Number(value)) ? 0 : Number(value)])
    ) as UnitCosts;
    const sanitizedBuildingCosts = Object.fromEntries(
        Object.entries(buildingCosts).map(([key, value]) => [key, isNaN(Number(value)) ? 0 : Number(value)])
    ) as BuildingCosts;

    try {
        await setDoc(costsDocRef, {
            units: sanitizedUnitCosts,
            buildings: sanitizedBuildingCosts,
        }, { merge: true });
        toast({
            title: "Biaya Diperbarui",
            description: "Biaya dasar untuk unit dan bangunan telah disimpan.",
        });
    } catch (error) {
        console.error("Error updating costs:", error);
        toast({
            title: "Gagal Memperbarui Biaya",
            description: "Terjadi kesalahan saat mencoba menyimpan biaya.",
            variant: "destructive",
        });
    } finally {
        setIsSavingCosts(false);
    }
  };

  const handleUpdateTimeSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingTime(true);
    const timingDocRef = doc(db, 'game-settings', 'timing-rules');
    try {
        await setDoc(timingDocRef, {
            constructionTimeInHours: Number(constructionTime),
            trainingTimeInHours: Number(trainingTime),
        }, { merge: true });
        toast({
            title: "Pengaturan Waktu Diperbarui",
            description: "Waktu konstruksi dan pelatihan telah disimpan.",
        });
    } catch (error) {
        console.error("Error updating time settings:", error);
        toast({
            title: "Gagal Memperbarui Waktu",
            description: "Terjadi kesalahan saat mencoba menyimpan pengaturan waktu.",
            variant: "destructive",
        });
    } finally {
        setIsSavingTime(false);
    }
  };
  
  const handleUpdateEffects = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingEffects(true);
    const effectsDocRef = doc(db, 'game-settings', 'building-effects');
    try {
        await setDoc(effectsDocRef, buildingEffects, { merge: true });
        toast({
            title: "Efek Bangunan Diperbarui",
            description: "Logika permainan untuk efek bangunan telah disimpan.",
        });
    } catch (error) {
        console.error("Error updating effects:", error);
        toast({
            title: "Gagal Memperbarui Efek",
            description: "Terjadi kesalahan saat mencoba menyimpan logika permainan.",
            variant: "destructive",
        });
    } finally {
        setIsSavingEffects(false);
    }
  };

  const handleUpdateMechanics = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingMechanics(true);
    const mechanicsDocRef = doc(db, 'game-settings', 'game-mechanics');
    try {
        await setDoc(mechanicsDocRef, {
            votingPowerDivisor: Number(votingPowerDivisor),
        }, { merge: true });
        toast({
            title: "Mekanisme Diperbarui",
            description: "Pengaturan mekanisme permainan telah disimpan.",
        });
    } catch (error) {
        console.error("Error updating mechanics:", error);
        toast({
            title: "Gagal Memperbarui Mekanisme",
            variant: "destructive",
        });
    } finally {
        setIsSavingMechanics(false);
    }
  };

  const handleResetGame = async () => {
    setIsResetting(true);
    try {
        const settingsDocRef = doc(db, 'game-settings', 'initial-resources');
        const settingsDocSnap = await getDoc(settingsDocRef);
        const initialResources = settingsDocSnap.exists() 
            ? settingsDocSnap.data() 
            : { money: 1000, food: 500, land: 100, unemployed: 10 };

        const usersQuery = query(collection(db, 'users'), where('role', '==', 'user'));
        const usersSnapshot = await getDocs(usersQuery);

        if (usersSnapshot.empty) {
            toast({ title: "Tidak ada pemain untuk direset", description: "Tidak ada pengguna non-admin yang ditemukan." });
            setIsResetting(false);
            return;
        }

        const constructionQueueSnapshot = await getDocs(collection(db, 'constructionQueue'));
        const trainingQueueSnapshot = await getDocs(collection(db, 'trainingQueue'));
        
        const MAX_OPS_PER_BATCH = 499;
        const batches = [writeBatch(db)];
        let opsInCurrentBatch = 0;

        const getNextBatch = () => {
            if (opsInCurrentBatch >= MAX_OPS_PER_BATCH) {
                batches.push(writeBatch(db));
                opsInCurrentBatch = 0;
            }
            opsInCurrentBatch++;
            return batches[batches.length - 1];
        };

        usersSnapshot.forEach(userDoc => {
            const batch = getNextBatch();
            batch.update(userDoc.ref, {
                money: initialResources.money ?? 1000,
                food: initialResources.food ?? 500,
                land: initialResources.land ?? 100,
                pride: 500,
                unemployed: initialResources.unemployed ?? 10,
                buildings: { residence: 0, farm: 0, fort: 0, university: 0, barracks: 0, mobility: 0, tambang: 0 },
                units: { attack: 0, defense: 0, elite: 0, raider: 0, spy: 0 },
                lastResourceUpdate: serverTimestamp(),
            });
        });

        constructionQueueSnapshot.forEach(doc => {
            const batch = getNextBatch();
            batch.delete(doc.ref);
        });

        trainingQueueSnapshot.forEach(doc => {
            const batch = getNextBatch();
            batch.delete(doc.ref);
        });

        await Promise.all(batches.map(b => b.commit()));

        toast({
            title: "Reset Permainan Berhasil",
            description: `Data untuk ${usersSnapshot.size} pemain telah berhasil direset ke keadaan awal.`,
        });

    } catch (error) {
        console.error("Error resetting game:", error);
        toast({
            title: "Gagal Mereset Permainan",
            description: "Terjadi kesalahan saat mencoba mereset data permainan.",
            variant: "destructive",
        });
    } finally {
        setIsResetting(false);
    }
  };

  const handleResetAlliances = async () => {
    setIsResettingAlliances(true);
    try {
        const MAX_OPS_PER_BATCH = 499;
        const batches: any[] = [];
        let currentBatch = writeBatch(db);
        let opsInCurrentBatch = 0;

        const addOpToBatch = () => {
            if (opsInCurrentBatch >= MAX_OPS_PER_BATCH) {
                batches.push(currentBatch);
                currentBatch = writeBatch(db);
                opsInCurrentBatch = 0;
            }
            opsInCurrentBatch++;
            return currentBatch;
        };

        const usersQuery = query(collection(db, 'users'), where('allianceId', '!=', null));
        const usersSnapshot = await getDocs(usersQuery);

        usersSnapshot.forEach(userDoc => {
            addOpToBatch().update(userDoc.ref, { allianceId: null });
        });

        const votesSnapshot = await getDocs(collection(db, 'votes'));
        votesSnapshot.forEach(voteDoc => {
            addOpToBatch().delete(voteDoc.ref);
        });
        
        batches.push(currentBatch);

        if (usersSnapshot.empty && votesSnapshot.empty) {
            toast({
                title: "Tidak ada yang perlu direset",
                description: "Tidak ada pemain dalam aliansi atau tidak ada suara yang tercatat.",
            });
            setIsResettingAlliances(false);
            return;
        }

        await Promise.all(batches.map(b => b.commit()));

        toast({
            title: "Reset Aliansi Berhasil",
            description: `Keanggotaan aliansi untuk ${usersSnapshot.size} pemain telah dihapus dan semua suara telah dihapus.`,
        });
    } catch (error: any) {
        console.error("Error resetting alliances:", error);
        toast({
            title: "Gagal Mereset Aliansi",
            description: "Terjadi kesalahan saat mencoba mereset data aliansi.",
            variant: "destructive",
        });
    } finally {
        setIsResettingAlliances(false);
    }
  };

  const handleDeleteAllPlayers = async () => {
    setIsDeletingPlayers(true);
    try {
      const usersQuery = query(collection(db, 'users'), where('role', '==', 'user'));
      const usersSnapshot = await getDocs(usersQuery);

      if (usersSnapshot.empty) {
        toast({ title: "Tidak ada pemain untuk dihapus", description: "Tidak ada pengguna non-admin yang ditemukan." });
        setIsDeletingPlayers(false);
        return;
      }
      
      // Note: Deleting auth users is a privileged backend operation.
      // This client-side code will only delete Firestore data.
      // A Cloud Function would be needed to delete the actual auth accounts.
      const batch = writeBatch(db);
      usersSnapshot.forEach(userDoc => {
          batch.delete(userDoc.ref);
      });
      await batch.commit();
      
      toast({
        title: "Penghapusan Berhasil",
        description: `Data Firestore untuk ${usersSnapshot.size} pemain telah dihapus. Hapus akun Auth mereka secara manual melalui Firebase Console atau dengan fungsi backend.`,
      });
      setUsers(users.filter(u => u.role === 'admin'));

    } catch (error) {
      console.error("Error deleting players:", error);
      toast({
        title: "Gagal Menghapus Pemain",
        description: "Terjadi kesalahan saat mencoba menghapus data pemain dari Firestore.",
        variant: "destructive",
      });
    } finally {
      setIsDeletingPlayers(false);
    }
  };

  const handleAddTitle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitleName || newTitlePride < 0) {
        toast({ title: "Input Tidak Valid", description: "Nama gelar dan nilai pride harus diisi.", variant: "destructive" });
        return;
    }
    setIsSavingTitle(true);
    try {
        const newTitleRef = await addDoc(collection(db, 'titles'), {
            name: newTitleName,
            prideRequired: Number(newTitlePride),
            attackBonus: Number(newTitleAttack),
            defenseBonus: Number(newTitleDefense),
            resourceBonus: Number(newTitleResource),
        });
        const newTitle = { id: newTitleRef.id, name: newTitleName, prideRequired: Number(newTitlePride), attackBonus: Number(newTitleAttack), defenseBonus: Number(newTitleDefense), resourceBonus: Number(newTitleResource) };
        setTitles([...titles, newTitle].sort((a, b) => a.prideRequired - b.prideRequired));

        toast({ title: "Gelar Ditambahkan", description: "Gelar baru telah berhasil disimpan." });
        setNewTitleName('');
        setNewTitlePride(0);
        setNewTitleAttack(0);
        setNewTitleDefense(0);
        setNewTitleResource(0);
    } catch (error) {
        console.error("Error adding title:", error);
        toast({ title: "Gagal Menambah Gelar", variant: "destructive" });
    } finally {
        setIsSavingTitle(false);
    }
  };

  const handleDeleteTitle = async (titleId: string) => {
      try {
          await deleteDoc(doc(db, 'titles', titleId));
          setTitles(titles.filter(t => t.id !== titleId));
          toast({ title: "Gelar Dihapus", description: "Gelar telah berhasil dihapus." });
      } catch (error) {
          console.error("Error deleting title:", error);
          toast({ title: "Gagal Menghapus Gelar", variant: "destructive" });
      }
  };
  
  const handleOpenEditDialog = (title: GameTitle) => {
    setEditingTitle(title);
    setEditFormData({
      name: title.name,
      prideRequired: title.prideRequired,
      attackBonus: title.attackBonus,
      defenseBonus: title.defenseBonus,
      resourceBonus: title.resourceBonus,
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateTitle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTitle) return;

    setIsUpdatingTitle(true);
    try {
      const titleRef = doc(db, 'titles', editingTitle.id);
      const updatedData = {
        name: editFormData.name,
        prideRequired: Number(editFormData.prideRequired),
        attackBonus: Number(editFormData.attackBonus),
        defenseBonus: Number(editFormData.defenseBonus),
        resourceBonus: Number(editFormData.resourceBonus),
      };
      await updateDoc(titleRef, updatedData);
      
      setTitles(titles.map(t => t.id === editingTitle.id ? { ...t, ...updatedData } : t));
      toast({ title: "Gelar Diperbarui", description: "Data gelar telah berhasil diperbarui." });
      setIsEditDialogOpen(false);
      setEditingTitle(null);
    } catch (error) {
      console.error("Error updating title:", error);
      toast({ title: "Gagal Memperbarui Gelar", variant: "destructive" });
    } finally {
      setIsUpdatingTitle(false);
    }
  };

  const handleAddAlliance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAllianceName || !newAllianceTag) {
        toast({ title: "Input Tidak Valid", description: "Nama, tag, dan koordinat aliansi harus diisi.", variant: "destructive" });
        return;
    }
    setIsSavingAlliance(true);
    try {
        const newAllianceRef = await addDoc(collection(db, 'alliances'), {
            name: newAllianceName,
            tag: newAllianceTag.toUpperCase(),
            coordinates: {
                x: Number(newAllianceX),
                y: Number(newAllianceY)
            },
            logoUrl: 'https://placehold.co/128x128.png',
        });
        const newAlliance = { id: newAllianceRef.id, name: newAllianceName, tag: newAllianceTag.toUpperCase(), coordinates: { x: Number(newAllianceX), y: Number(newAllianceY) }, logoUrl: 'https://placehold.co/128x128.png' };
        setAlliances([...alliances, newAlliance]);
        toast({ title: "Aliansi Ditambahkan", description: "Aliansi baru telah berhasil dibuat." });
        
        setNewAllianceName('');
        setNewAllianceTag('');
        setNewAllianceX(0);
        setNewAllianceY(0);
    } catch (error) {
        console.error("Error adding alliance:", error);
        toast({ title: "Gagal Menambah Aliansi", variant: "destructive" });
    } finally {
        setIsSavingAlliance(false);
    }
  };

  const handleDeleteAlliance = async (allianceId: string) => {
      try {
          await deleteDoc(doc(db, 'alliances', allianceId));
          setAlliances(alliances.filter(a => a.id !== allianceId));
          toast({ title: "Aliansi Dihapus", description: "Aliansi telah berhasil dihapus." });
      } catch (error) {
          console.error("Error deleting alliance:", error);
          toast({ title: "Gagal Menghapus Aliansi", variant: "destructive" });
      }
  };

  const handleUpdateAdminMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingMessage(true);
    const infoDocRef = doc(db, 'game-settings', 'admin-info');
    try {
        await setDoc(infoDocRef, { message: adminMessage }, { merge: true });
        toast({
            title: "Pesan Diperbarui",
            description: "Informasi untuk pemain telah berhasil disimpan.",
        });
    } catch (error) {
        console.error("Error updating admin message:", error);
        toast({
            title: "Gagal Memperbarui Pesan",
            description: "Terjadi kesalahan saat mencoba menyimpan pesan.",
        });
    } finally {
        setIsSavingMessage(false);
    }
  };

  const getTitleNameForPride = (pride: number, titles: GameTitle[]) => {
    if (!titles || titles.length === 0) return 'Tanpa Gelar';
    const achievedTitle = [...titles].reverse().find(t => pride >= t.prideRequired);
    return achievedTitle ? achievedTitle.name : 'Tanpa Gelar';
  };
  
  const handleOpenEditUserDialog = (user: DisplayUser) => {
    setEditingUser(user);
    setEditUserFormData({
      prideName: user.prideName,
      coordinates: user.coordinates ?? { x: 0, y: 0 },
      pride: user.pride ?? 0,
      allianceId: user.allianceId ?? null,
    });
    setIsEditUserDialogOpen(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setIsUpdatingUser(true);
    try {
      const userRef = doc(db, 'users', editingUser.id);
      
      const newCoordinates = {
          x: Number(editUserFormData.coordinates?.x ?? 0),
          y: Number(editUserFormData.coordinates?.y ?? 0)
      };

      const updatedData = {
        prideName: editUserFormData.prideName,
        coordinates: newCoordinates,
        pride: Number(editUserFormData.pride ?? 0),
        allianceId: editUserFormData.allianceId ?? null,
      };

      await updateDoc(userRef, updatedData);
      setUsers(users.map(u => u.id === editingUser.id ? { ...u, ...updatedData } : u));
      toast({ title: "Pengguna Diperbarui", description: "Data pengguna telah berhasil diperbarui." });
      setIsEditUserDialogOpen(false);
      setEditingUser(null);
    } catch (error) {
      console.error("Error updating user:", error);
      toast({ title: "Gagal Memperbarui Pengguna", variant: "destructive" });
    } finally {
      setIsUpdatingUser(false);
    }
  };

  const handleGetAdvice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuery) {
        toast({ title: "Pertanyaan tidak boleh kosong", description: "Silakan masukkan skenario atau pertanyaan untuk dianalisis." });
        return;
    }
    setIsGettingAdvice(true);
    setAiResponse(null);

    try {
        const settings: GameAdviceInput['settings'] = {
            initialResources: {
                money: initialMoney,
                food: initialFood,
                land: initialLand,
            },
            globalBonuses: {
                money: hourlyMoneyBonus,
                food: hourlyFoodBonus,
            },
            costs: {
                units: unitCosts,
                buildings: buildingCosts,
            },
            timing: {
                constructionTime: constructionTime,
                trainingTime: trainingTime,
            },
            effects: buildingEffects,
            titles: titles,
            mechanics: {
                votingPowerDivisor: votingPowerDivisor,
            },
        };
        
        const response = await getGameAdvice({ query: aiQuery, settings });
        setAiResponse(response);

    } catch (error) {
        console.error("Error getting AI advice:", error);
        toast({
            title: "Gagal Mendapatkan Saran AI",
            description: "Terjadi kesalahan saat berkomunikasi dengan AI. Silakan coba lagi.",
            variant: "destructive",
        });
    } finally {
        setIsGettingAdvice(false);
    }
  };

  const handleApplyAiChanges = async () => {
    if (!aiResponse?.suggestedChanges) {
        toast({ title: "Tidak ada saran perubahan untuk diterapkan.", variant: "destructive" });
        return;
    }

    setIsApplyingChanges(true);
    const { suggestedChanges } = aiResponse;

    try {
        const batch = writeBatch(db);
        let changesMade = false;

        const mergeState = (setter: React.Dispatch<React.SetStateAction<any>>, changes: object) => {
            setter((prev: any) => ({ ...prev, ...changes }));
        };

        if (suggestedChanges.initialResources && Object.keys(suggestedChanges.initialResources).length > 0) {
            batch.set(doc(db, 'game-settings', 'initial-resources'), suggestedChanges.initialResources, { merge: true });
            if (suggestedChanges.initialResources.money !== undefined) setInitialMoney(suggestedChanges.initialResources.money);
            if (suggestedChanges.initialResources.food !== undefined) setInitialFood(suggestedChanges.initialResources.food);
            if (suggestedChanges.initialResources.land !== undefined) setInitialLand(suggestedChanges.initialResources.land);
            changesMade = true;
        }

        if (suggestedChanges.globalBonuses && Object.keys(suggestedChanges.globalBonuses).length > 0) {
            batch.set(doc(db, 'game-settings', 'global-bonuses'), suggestedChanges.globalBonuses, { merge: true });
            if (suggestedChanges.globalBonuses.money !== undefined) setHourlyMoneyBonus(suggestedChanges.globalBonuses.money);
            if (suggestedChanges.globalBonuses.food !== undefined) setHourlyFoodBonus(suggestedChanges.globalBonuses.food);
            changesMade = true;
        }

        if (suggestedChanges.costs) {
            const costsDocRef = doc(db, 'game-settings', 'game-costs');
            if (suggestedChanges.costs.units) {
                batch.set(costsDocRef, { units: suggestedChanges.costs.units }, { merge: true });
                mergeState(setUnitCosts, suggestedChanges.costs.units);
                changesMade = true;
            }
            if (suggestedChanges.costs.buildings) {
                batch.set(costsDocRef, { buildings: suggestedChanges.costs.buildings }, { merge: true });
                mergeState(setBuildingCosts, suggestedChanges.costs.buildings);
                changesMade = true;
            }
        }
        
        if (suggestedChanges.timing && Object.keys(suggestedChanges.timing).length > 0) {
            const timingUpdates: Record<string, number> = {};
            if(suggestedChanges.timing.constructionTime !== undefined) timingUpdates.constructionTimeInHours = suggestedChanges.timing.constructionTime;
            if(suggestedChanges.timing.trainingTime !== undefined) timingUpdates.trainingTimeInHours = suggestedChanges.timing.trainingTime;

            batch.set(doc(db, 'game-settings', 'timing-rules'), timingUpdates, { merge: true });

            if (suggestedChanges.timing.constructionTime !== undefined) setConstructionTime(suggestedChanges.timing.constructionTime);
            if (suggestedChanges.timing.trainingTime !== undefined) setTrainingTime(suggestedChanges.timing.trainingTime);
            changesMade = true;
        }
        
        if (suggestedChanges.effects && Object.keys(suggestedChanges.effects).length > 0) {
            batch.set(doc(db, 'game-settings', 'building-effects'), suggestedChanges.effects, { merge: true });
            setBuildingEffects(prev => {
                const newEffects = JSON.parse(JSON.stringify(prev));
                for (const [building, effectChanges] of Object.entries(suggestedChanges.effects!)) {
                    if (!newEffects[building]) newEffects[building] = {};
                    Object.assign(newEffects[building], effectChanges);
                }
                return newEffects;
            });
            changesMade = true;
        }

        if (suggestedChanges.mechanics && suggestedChanges.mechanics.votingPowerDivisor !== undefined) {
             batch.set(doc(db, 'game-settings', 'game-mechanics'), suggestedChanges.mechanics, { merge: true });
             setVotingPowerDivisor(suggestedChanges.mechanics.votingPowerDivisor);
             changesMade = true;
        }

        if (changesMade) {
            await batch.commit();
            toast({ title: "Perubahan Diterapkan", description: "Pengaturan permainan telah diperbarui sesuai saran AI." });
        } else {
             toast({ title: "Tidak ada perubahan", description: "AI tidak menyarankan perubahan terstruktur apa pun." });
        }
    } catch (error) {
        console.error("Error applying AI changes:", error);
        toast({ title: "Gagal Menerapkan Perubahan", description: "Terjadi kesalahan saat menyimpan perubahan yang disarankan.", variant: "destructive" });
    } finally {
        setIsApplyingChanges(false);
    }
  };
  
    const handleEndWar = async (warId: string) => {
        try {
            await deleteDoc(doc(db, "wars", warId));
            setWars(wars.filter(w => w.id !== warId));
            toast({ title: "Perang Diakhiri", description: "Permusuhan telah berhenti." });
        } catch (error) {
            console.error("Error ending war:", error);
            toast({ title: "Gagal Mengakhiri Perang", variant: "destructive" });
        }
    };


  if (loading || !user || !userProfile) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4">
                <Crown className="h-12 w-12 animate-pulse text-primary" />
                <p className="text-muted-foreground">Loading Admin Dashboard...</p>
            </div>
        </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-screen w-full flex-col bg-muted/40">
        <div className="flex flex-col sm:gap-4 sm:py-4 sm:pl-14">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
            <h1 className="text-2xl">Admin Dashboard</h1>
            <div className="flex items-center gap-2">
              <ModeToggle />
              <Button variant="outline" onClick={handleLogout}>Keluar</Button>
            </div>
          </header>
          <main className="flex flex-1 flex-col gap-4 p-4 sm:px-6 sm:py-0 md:gap-8">
            <Card>
              <CardHeader>
                <CardTitle>Selamat Datang, Administrator</CardTitle>
                <CardDescription>
                  Ini adalah pusat untuk mengelola Code Name.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p>Dari sini, Anda dapat mengelola pengguna, memantau aktivitas permainan, dan menyesuaikan parameter permainan.</p>
              </CardContent>
            </Card>
            
            <Tabs defaultValue="settings">
                <TabsList className="grid w-full grid-cols-6">
                    <TabsTrigger value="settings">Pengaturan</TabsTrigger>
                    <TabsTrigger value="ai-advice">Saran AI</TabsTrigger>
                    <TabsTrigger value="alliances">Aliansi &amp; Peringkat</TabsTrigger>
                    <TabsTrigger value="wars">Manajemen Perang</TabsTrigger>
                    <TabsTrigger value="users">Manajemen Pengguna</TabsTrigger>
                    <TabsTrigger value="danger">Area Berbahaya</TabsTrigger>
                </TabsList>
                <TabsContent value="settings">
                    <Card>
                      <CardHeader>
                        <CardTitle>Pengaturan Awal Permainan</CardTitle>
                        <CardDescription>
                          Atur sumber daya awal yang diterima pengguna baru saat mendaftar.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {isLoadingSettings ? (
                          <p className="text-sm text-muted-foreground">Memuat pengaturan...</p>
                        ) : (
                          <form onSubmit={handleUpdateSettings} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                  <Label htmlFor="initial-money">Uang Awal</Label>
                                  <Input
                                    id="initial-money"
                                    type="number"
                                    value={initialMoney}
                                    onChange={(e) => setInitialMoney(Number(e.target.value))}
                                    min="0"
                                  />
                                </div>
                                <div className="grid gap-2">
                                  <Label htmlFor="initial-food">Makanan Awal</Label>
                                  <Input
                                    id="initial-food"
                                    type="number"
                                    value={initialFood}
                                    onChange={(e) => setInitialFood(Number(e.target.value))}
                                    min="0"
                                  />
                                </div>
                                <div className="grid gap-2">
                                  <Label htmlFor="initial-land">Tanah Awal</Label>
                                  <Input
                                    id="initial-land"
                                    type="number"
                                    value={initialLand}
                                    onChange={(e) => setInitialLand(Number(e.target.value))}
                                    min="0"
                                  />
                                </div>
                                <div className="grid gap-2">
                                  <Label htmlFor="initial-unemployed">Pengangguran Awal</Label>
                                  <Input
                                    id="initial-unemployed"
                                    type="number"
                                    value={initialUnemployed}
                                    onChange={(e) => setInitialUnemployed(Number(e.target.value))}
                                    min="0"
                                  />
                                </div>
                            </div>
                            <Button type="submit" className="w-full">Simpan Pengaturan</Button>
                          </form>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="mt-6">
                      <CardHeader>
                        <CardTitle>Bonus Global Per Jam</CardTitle>
                        <CardDescription>
                          Atur bonus sumber daya yang diterima semua pemain (yang aktif) setiap jam.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {isLoadingSettings ? (
                          <p className="text-sm text-muted-foreground">Memuat pengaturan...</p>
                        ) : (
                          <form onSubmit={handleUpdateBonuses} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                  <Label htmlFor="bonus-money">Bonus Uang (per jam)</Label>
                                  <Input
                                    id="bonus-money"
                                    type="number"
                                    value={hourlyMoneyBonus}
                                    onChange={(e) => setHourlyMoneyBonus(Number(e.target.value))}
                                    min="0"
                                  />
                                </div>
                                <div className="grid gap-2">
                                  <Label htmlFor="bonus-food">Bonus Makanan (per jam)</Label>
                                  <Input
                                    id="bonus-food"
                                    type="number"
                                    value={hourlyFoodBonus}
                                    onChange={(e) => setHourlyFoodBonus(Number(e.target.value))}
                                    min="0"
                                  />
                                </div>
                            </div>
                            <Button type="submit" className="w-full" disabled={isSavingBonuses}>
                                {isSavingBonuses ? 'Menyimpan...' : 'Simpan Bonus Global'}
                            </Button>
                          </form>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="mt-6">
                        <CardHeader>
                            <CardTitle>Pengaturan Biaya Permainan</CardTitle>
                            <CardDescription>
                                Atur biaya dasar untuk membangun bangunan dan melatih pasukan.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoadingSettings ? (
                                <p className="text-sm text-muted-foreground">Memuat pengaturan biaya...</p>
                            ) : (
                                <form onSubmit={handleUpdateCosts} className="space-y-6">
                                    <div>
                                        <h3 className="text-lg mb-4">Biaya Bangunan</h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="grid gap-2">
                                                <Label htmlFor="cost-residence">Rumah</Label>
                                                <Input id="cost-residence" type="number" value={buildingCosts.residence} onChange={e => setBuildingCosts(prev => ({...prev, residence: Number(e.target.value)}))} min="0" />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="cost-farm">Sawah</Label>
                                                <Input id="cost-farm" type="number" value={buildingCosts.farm} onChange={e => setBuildingCosts(prev => ({...prev, farm: Number(e.target.value)}))} min="0" />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="cost-fort">Benteng</Label>
                                                <Input id="cost-fort" type="number" value={buildingCosts.fort} onChange={e => setBuildingCosts(prev => ({...prev, fort: Number(e.target.value)}))} min="0" />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="cost-university">Kampus</Label>
                                                <Input id="cost-university" type="number" value={buildingCosts.university} onChange={e => setBuildingCosts(prev => ({...prev, university: Number(e.target.value)}))} min="0" />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="cost-barracks">Barak Pasukan</Label>
                                                <Input id="cost-barracks" type="number" value={buildingCosts.barracks} onChange={e => setBuildingCosts(prev => ({...prev, barracks: Number(e.target.value)}))} min="0" />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="cost-mobility">Mobilitas Pasukan</Label>
                                                <Input id="cost-mobility" type="number" value={buildingCosts.mobility} onChange={e => setBuildingCosts(prev => ({...prev, mobility: Number(e.target.value)}))} min="0" />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="cost-tambang">Tambang</Label>
                                                <Input id="cost-tambang" type="number" value={buildingCosts.tambang} onChange={e => setBuildingCosts(prev => ({...prev, tambang: Number(e.target.value)}))} min="0" />
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-lg mb-4">Biaya Pasukan</h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="grid gap-2">
                                                <Label htmlFor="cost-attack">Pasukan Serang</Label>
                                                <Input id="cost-attack" type="number" value={unitCosts.attack} onChange={e => setUnitCosts(prev => ({...prev, attack: Number(e.target.value)}))} min="0" />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="cost-defense">Pasukan Bertahan</Label>
                                                <Input id="cost-defense" type="number" value={unitCosts.defense} onChange={e => setUnitCosts(prev => ({...prev, defense: Number(e.target.value)}))} min="0" />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="cost-elite">Pasukan Elit</Label>
                                                <Input id="cost-elite" type="number" value={unitCosts.elite} onChange={e => setUnitCosts(prev => ({...prev, elite: Number(e.target.value)}))} min="0" />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="cost-raider">Perampok</Label>
                                                <Input id="cost-raider" type="number" value={unitCosts.raider} onChange={e => setUnitCosts(prev => ({...prev, raider: Number(e.target.value)}))} min="0" />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="cost-spy">Mata-mata</Label>
                                                <Input id="cost-spy" type="number" value={unitCosts.spy} onChange={e => setUnitCosts(prev => ({...prev, spy: Number(e.target.value)}))} min="0" />
                                            </div>
                                        </div>
                                    </div>
                                    <Button type="submit" className="w-full" disabled={isSavingCosts}>
                                        {isSavingCosts ? 'Menyimpan...' : 'Simpan Biaya'}
                                    </Button>
                                </form>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="mt-6">
                        <CardHeader>
                            <CardTitle>Pengaturan Waktu Permainan</CardTitle>
                            <CardDescription>
                                Atur durasi dalam jam (waktu nyata) untuk konstruksi dan pelatihan. 1 jam = 1 hari permainan.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoadingSettings ? (
                                <p className="text-sm text-muted-foreground">Memuat pengaturan waktu...</p>
                            ) : (
                                <form onSubmit={handleUpdateTimeSettings} className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label htmlFor="construction-time">Waktu Konstruksi (jam)</Label>
                                            <Input
                                                id="construction-time"
                                                type="number"
                                                value={constructionTime}
                                                onChange={(e) => setConstructionTime(Number(e.target.value))}
                                                min="0"
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="training-time">Waktu Pelatihan (jam)</Label>
                                            <Input
                                                id="training-time"
                                                type="number"
                                                value={trainingTime}
                                                onChange={(e) => setTrainingTime(Number(e.target.value))}
                                                min="0"
                                            />
                                        </div>
                                    </div>
                                    <Button type="submit" className="w-full" disabled={isSavingTime}>
                                        {isSavingTime ? 'Menyimpan...' : 'Simpan Pengaturan Waktu'}
                                    </Button>
                                </form>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="mt-6">
                        <CardHeader>
                            <CardTitle>Logika &amp; Efek Bangunan</CardTitle>
                            <CardDescription>
                                Atur efek dan hasil dari setiap bangunan per hari permainan (per jam nyata).
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoadingSettings ? (
                                <p className="text-sm text-muted-foreground">Memuat pengaturan logika...</p>
                            ) : (
                                <form onSubmit={handleUpdateEffects} className="space-y-6">
                                    {Object.keys(buildingEffects).map((buildingKey) => (
                                        <div key={buildingKey}>
                                            <h3 className="text-lg mb-2">{buildingNameMap[buildingKey as keyof BuildingEffects] || buildingKey}</h3>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 border p-4 rounded-md">
                                                {Object.keys(buildingEffects[buildingKey as keyof BuildingEffects]).map(effectKey => (
                                                    <div key={effectKey} className="grid gap-2">
                                                        <Label htmlFor={`effect-${buildingKey}-${effectKey}`} className='text-sm'>
                                                          {effectNameMap[effectKey] || effectKey}
                                                        </Label>
                                                        <Input 
                                                            id={`effect-${buildingKey}-${effectKey}`} 
                                                            type="number" 
                                                            value={buildingEffects[buildingKey as keyof BuildingEffects][effectKey as keyof typeof buildingEffects[keyof BuildingEffects]]}
                                                            onChange={e => setBuildingEffects(prev => ({
                                                                ...prev,
                                                                [buildingKey]: {
                                                                    ...prev[buildingKey as keyof BuildingEffects],
                                                                    [effectKey]: Number(e.target.value)
                                                                }
                                                            }))}
                                                            min="0"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                    <Button type="submit" className="w-full" disabled={isSavingEffects}>
                                        {isSavingEffects ? 'Menyimpan...' : 'Simpan Logika Permainan'}
                                    </Button>
                                </form>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="mt-6">
                        <CardHeader>
                            <CardTitle>Pengaturan Gelar Pride</CardTitle>
                            <CardDescription>
                                Atur gelar yang didapat pemain berdasarkan total nilai pride mereka.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoadingTitles ? (
                                <p className="text-sm text-muted-foreground">Memuat pengaturan gelar...</p>
                            ) : (
                                <div className="space-y-6">
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Nama Gelar</TableHead>
                                                    <TableHead>Pride Dibutuhkan</TableHead>
                                                    <TableHead>Bonus Serang (%)</TableHead>
                                                    <TableHead>Bonus Bertahan (%)</TableHead>
                                                    <TableHead>Bonus Sumber Daya (%)</TableHead>
                                                    <TableHead className="text-right">Aksi</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {titles.length > 0 ? (
                                                    titles.map((title) => (
                                                        <TableRow key={title.id}>
                                                            <TableCell>{title.name}</TableCell>
                                                            <TableCell>{title.prideRequired}</TableCell>
                                                            <TableCell>{title.attackBonus}</TableCell>
                                                            <TableCell>{title.defenseBonus}</TableCell>
                                                            <TableCell>{title.resourceBonus}</TableCell>
                                                            <TableCell className="text-right">
                                                              <div className="flex justify-end gap-2">
                                                                <Tooltip>
                                                                  <TooltipTrigger asChild>
                                                                    <Button variant="ghost" size="icon" onClick={() => handleOpenEditDialog(title)}>
                                                                      <Pencil className="h-4 w-4" />
                                                                      <span className="sr-only">Edit Gelar</span>
                                                                    </Button>
                                                                  </TooltipTrigger>
                                                                  <TooltipContent>
                                                                    <p>Edit Gelar</p>
                                                                  </TooltipContent>
                                                                </Tooltip>
                                                                <AlertDialog>
                                                                    <AlertDialogTrigger asChild>
                                                                        <Button variant="destructive" size="icon">
                                                                            <Trash2 className="h-4 w-4" />
                                                                            <span className="sr-only">Hapus Gelar</span>
                                                                        </Button>
                                                                    </AlertDialogTrigger>
                                                                    <AlertDialogContent>
                                                                        <AlertDialogHeader>
                                                                            <AlertDialogTitle>Hapus Gelar?</AlertDialogTitle>
                                                                            <AlertDialogDescription>
                                                                                Apakah Anda yakin ingin menghapus gelar '{title.name}'? Tindakan ini tidak dapat dibatalkan.
                                                                            </AlertDialogDescription>
                                                                        </AlertDialogHeader>
                                                                        <AlertDialogFooter>
                                                                            <AlertDialogCancel>Batal</AlertDialogCancel>
                                                                            <AlertDialogAction onClick={() => handleDeleteTitle(title.id)}>
                                                                                Hapus
                                                                            </AlertDialogAction>
                                                                        </AlertDialogFooter>
                                                                    </AlertDialogContent>
                                                                </AlertDialog>
                                                              </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                ) : (
                                                    <TableRow>
                                                        <TableCell colSpan={6} className="text-center">Belum ada gelar yang diatur.</TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    <Separator />
                                    <form onSubmit={handleAddTitle} className="space-y-4">
                                        <h3 className="text-lg">Tambah Gelar Baru</h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                            <div className="grid gap-2">
                                                <Label htmlFor="title-name">Nama Gelar</Label>
                                                <Input id="title-name" value={newTitleName} onChange={e => setNewTitleName(e.target.value)} required />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="title-pride">Pride Dibutuhkan</Label>
                                                <Input id="title-pride" type="number" value={newTitlePride} onChange={e => setNewTitlePride(Number(e.target.value))} min="0" required />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="title-attack">Bonus Serang (%)</Label>
                                                <Input id="title-attack" type="number" value={newTitleAttack} onChange={e => setNewTitleAttack(Number(e.target.value))} min="0" />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="title-defense">Bonus Bertahan (%)</Label>
                                                <Input id="title-defense" type="number" value={newTitleDefense} onChange={e => setNewTitleDefense(Number(e.target.value))} min="0" />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="title-resource">Bonus Sumber Daya (%)</Label>
                                                <Input id="title-resource" type="number" value={newTitleResource} onChange={e => setNewTitleResource(Number(e.target.value))} min="0" />
                                            </div>
                                        </div>
                                        <Button type="submit" className="w-full sm:w-auto" disabled={isSavingTitle}>
                                            {isSavingTitle ? 'Menyimpan...' : 'Tambah Gelar'}
                                        </Button>
                                    </form>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="mt-6">
                        <CardHeader>
                            <CardTitle>Papan Informasi Admin</CardTitle>
                            <CardDescription>
                                Tulis pesan yang akan ditampilkan di dasbor semua pemain.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoadingSettings ? (
                                <p className="text-sm text-muted-foreground">Memuat pengaturan...</p>
                            ) : (
                                <form onSubmit={handleUpdateAdminMessage} className="space-y-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="admin-message">Pesan</Label>
                                        <Textarea
                                            id="admin-message"
                                            value={adminMessage}
                                            onChange={(e) => setAdminMessage(e.target.value)}
                                            placeholder="Tulis pengumuman atau informasi penting di sini..."
                                            rows={5}
                                        />
                                    </div>
                                    <Button type="submit" className="w-full" disabled={isSavingMessage}>
                                        {isSavingMessage ? 'Menyimpan...' : 'Simpan Pesan'}
                                    </Button>
                                </form>
                            )}
                        </CardContent>
                    </Card>

                </TabsContent>
                <TabsContent value="ai-advice">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Lightbulb className="h-6 w-6 text-primary" />
                                Saran Keseimbangan Permainan
                            </CardTitle>
                            <CardDescription>
                                Gunakan AI untuk menganalisis pengaturan permainan Anda saat ini dan dapatkan saran tentang keseimbangan, potensi eksploitasi, dan ide-ide baru. Berikan skenario atau pertanyaan yang jelas untuk mendapatkan hasil terbaik.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleGetAdvice} className="space-y-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="ai-query">Pertanyaan atau Skenario Anda</Label>
                                    <Textarea
                                        id="ai-query"
                                        value={aiQuery}
                                        onChange={(e) => setAiQuery(e.target.value)}
                                        placeholder="Contoh: Apakah biaya pasukan elit terlalu mahal dibandingkan manfaatnya? Bagaimana jika saya ingin menambahkan sistem 'mata-mata'?"
                                        rows={4}
                                        disabled={isGettingAdvice}
                                    />
                                </div>
                                <Button type="submit" className="w-full" disabled={isGettingAdvice}>
                                    {isGettingAdvice ? 'Menganalisis...' : 'Dapatkan Saran AI'}
                                </Button>
                            </form>
                            {aiResponse && (
                                <div className="mt-6">
                                    <Separator />
                                    <div className="mt-6 space-y-6">
                                        <div>
                                            <h3 className="text-lg font-semibold mb-2">Analisis</h3>
                                            <Card className="bg-muted/50 p-4">
                                                <div className="text-sm whitespace-pre-wrap">{aiResponse.analysis}</div>
                                            </Card>
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold mb-2">Rekomendasi</h3>
                                            <Card className="bg-muted/50 p-4">
                                                <div className="text-sm whitespace-pre-wrap">{aiResponse.recommendation}</div>
                                            </Card>
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold mb-2">Risiko Potensial</h3>
                                            <Card className="bg-muted/50 p-4">
                                                <div className="text-sm whitespace-pre-wrap">{aiResponse.potentialRisks}</div>
                                            </Card>
                                        </div>
                                        
                                        {aiResponse.suggestedChanges && (
                                            <div className="flex justify-end pt-4">
                                                <Button 
                                                    onClick={handleApplyAiChanges} 
                                                    disabled={isApplyingChanges}
                                                    variant="secondary"
                                                >
                                                    {isApplyingChanges ? 'Menerapkan...' : 'Terapkan Saran Perubahan'}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="alliances">
                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle>Mekanisme Permainan &amp; Politik</CardTitle>
                            <CardDescription>
                                Atur mekanisme fundamental yang memengaruhi interaksi pemain dan aliansi.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoadingSettings ? (
                                <p className="text-sm text-muted-foreground">Memuat pengaturan mekanisme...</p>
                            ) : (
                                <form onSubmit={handleUpdateMechanics} className="space-y-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="voting-divisor">Pembagi Hak Pilih</Label>
                                        <Input
                                            id="voting-divisor"
                                            type="number"
                                            value={votingPowerDivisor}
                                            onChange={(e) => setVotingPowerDivisor(Number(e.target.value))}
                                            min="1"
                                        />
                                         <p className="text-xs text-muted-foreground">
                                            Jumlah tanah yang dibutuhkan untuk mendapatkan 1 hak pilih dalam pemilihan pemimpin aliansi.
                                         </p>
                                    </div>
                                    <Button type="submit" className="w-full" disabled={isSavingMechanics}>
                                        {isSavingMechanics ? 'Menyimpan...' : 'Simpan Mekanisme'}
                                    </Button>
                                </form>
                            )}
                        </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle>Manajemen Aliansi</CardTitle>
                        <CardDescription>
                          Buat, lihat, dan hapus aliansi dalam permainan.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                          {isLoadingAlliances ? (
                              <p className="text-sm text-muted-foreground">Memuat aliansi...</p>
                          ) : (
                              <div className="space-y-6">
                                  <div className="overflow-x-auto">
                                      <Table>
                                          <TableHeader>
                                              <TableRow>
                                                  <TableHead>Nama Aliansi</TableHead>
                                                  <TableHead>Tag</TableHead>
                                                  <TableHead>Koordinat</TableHead>
                                                  <TableHead className="text-right">Aksi</TableHead>
                                              </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                              {alliances.length > 0 ? (
                                                  alliances.map((alliance) => (
                                                      <TableRow key={alliance.id}>
                                                          <TableCell>{alliance.name}</TableCell>
                                                          <TableCell className='font-mono'>[{alliance.tag}]</TableCell>
                                                          <TableCell className='font-mono'>({alliance.coordinates?.x ?? '?'}, {alliance.coordinates?.y ?? '?'})</TableCell>
                                                          <TableCell className="text-right">
                                                              <AlertDialog>
                                                                  <AlertDialogTrigger asChild>
                                                                      <Button variant="destructive" size="icon">
                                                                          <Trash2 className="h-4 w-4" />
                                                                      </Button>
                                                                  </AlertDialogTrigger>
                                                                  <AlertDialogContent>
                                                                      <AlertDialogHeader>
                                                                          <AlertDialogTitle>Hapus Aliansi?</AlertDialogTitle>
                                                                          <AlertDialogDescription>
                                                                              Apakah Anda yakin ingin menghapus aliansi '{alliance.name}'? Tindakan ini tidak dapat dibatalkan.
                                                                          </AlertDialogDescription>
                                                                      </AlertDialogHeader>
                                                                      <AlertDialogFooter>
                                                                          <AlertDialogCancel>Batal</AlertDialogCancel>
                                                                          <AlertDialogAction onClick={() => handleDeleteAlliance(alliance.id)}>
                                                                              Hapus
                                                                          </AlertDialogAction>
                                                                      </AlertDialogFooter>
                                                                  </AlertDialogContent>
                                                              </AlertDialog>
                                                          </TableCell>
                                                      </TableRow>
                                                  ))
                                              ) : (
                                                  <TableRow>
                                                      <TableCell colSpan={4} className="text-center">Belum ada aliansi yang dibuat.</TableCell>
                                                  </TableRow>
                                              )}
                                          </TableBody>
                                      </Table>
                                  </div>
                                  <Separator />
                                  <form onSubmit={handleAddAlliance} className="space-y-4">
                                      <h3 className="text-lg">Buat Aliansi Baru</h3>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                          <div className="grid gap-2 sm:col-span-2">
                                              <Label htmlFor="alliance-name">Nama Aliansi</Label>
                                              <Input id="alliance-name" value={newAllianceName} onChange={e => setNewAllianceName(e.target.value)} required />
                                          </div>
                                          <div className="grid gap-2 sm:col-span-2">
                                              <Label htmlFor="alliance-tag">Tag Aliansi</Label>
                                              <Input id="alliance-tag" value={newAllianceTag} onChange={e => setNewAllianceTag(e.target.value)} required maxLength={200} />
                                          </div>
                                          <div className="border p-4 rounded-md sm:col-span-2">
                                              <Label className="text-sm font-medium">Lokasi</Label>
                                              <div className="grid grid-cols-2 gap-4 mt-2">
                                                  <div className="grid gap-2">
                                                      <Label htmlFor="alliance-x" className="text-xs text-muted-foreground">Koordinat X</Label>
                                                      <Input id="alliance-x" type="number" value={newAllianceX} onChange={e => setNewAllianceX(Number(e.target.value))} required />
                                                  </div>
                                                  <div className="grid gap-2">
                                                      <Label htmlFor="alliance-y" className="text-xs text-muted-foreground">Koordinat Y</Label>
                                                      <Input id="alliance-y" type="number" value={newAllianceY} onChange={e => setNewAllianceY(Number(e.target.value))} required />
                                                  </div>
                                              </div>
                                          </div>
                                      </div>
                                      <Button type="submit" className="w-full sm:w-auto" disabled={isSavingAlliance}>
                                          {isSavingAlliance ? 'Menyimpan...' : 'Buat Aliansi'}
                                      </Button>
                                  </form>
                              </div>
                          )}
                      </CardContent>
                    </Card>

                    <Card className="mt-6">
                        <CardHeader>
                            <CardTitle>Pencarian Peringkat</CardTitle>
                            <CardDescription>
                                Filter peringkat pemain berdasarkan nama pride.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="max-w-sm">
                                <Input
                                    placeholder="Cari nama pride..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="mt-6">
                        <CardHeader>
                            <CardTitle>Peringkat Pemain</CardTitle>
                            <CardDescription>Peringkat pemain berdasarkan total pride.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px]">#</TableHead>
                                        <TableHead>Nama Pride</TableHead>
                                        <TableHead>Gelar</TableHead>
                                        <TableHead>Provinsi</TableHead>
                                        <TableHead>Zodiak</TableHead>
                                        <TableHead className="text-right">Tanah</TableHead>
                                        <TableHead className="text-right">Pride</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoadingUsers || isLoadingTitles ? (
                                        <TableRow><TableCell colSpan={7} className="text-center">Memuat peringkat...</TableCell></TableRow>
                                    ) : prideRanking.length > 0 ? (
                                        prideRanking.map((user, index) => (
                                            <TableRow key={user.id}>
                                                <TableCell>{index + 1}</TableCell>
                                                <TableCell>{user.prideName}</TableCell>
                                                <TableCell>{getTitleNameForPride(user.pride ?? 0, titles)}</TableCell>
                                                <TableCell>{user.province}</TableCell>
                                                <TableCell>{user.zodiac}</TableCell>
                                                <TableCell className="text-right">{(user.land ?? 0).toLocaleString()}</TableCell>
                                                <TableCell className="text-right">{(user.pride ?? 0).toLocaleString()}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow><TableCell colSpan={7} className="text-center">Tidak ada pemain untuk diperingkatkan.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="wars">
                    <Card>
                        <CardHeader>
                            <CardTitle>Manajemen Perang</CardTitle>
                            <CardDescription>Lihat dan kelola perang yang sedang berlangsung antar aliansi.</CardDescription>
                        </CardHeader>
                        <CardContent>
                        {isLoadingWars ? (
                            <p>Memuat data perang...</p>
                        ) : wars.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Aliansi Penyerang</TableHead>
                                        <TableHead>Aliansi Bertahan</TableHead>
                                        <TableHead className="text-right">Aksi</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {wars.map(war => (
                                        <TableRow key={war.id}>
                                            <TableCell>[{war.alliance1Tag}] {war.alliance1Name}</TableCell>
                                            <TableCell>[{war.alliance2Tag}] {war.alliance2Name}</TableCell>
                                            <TableCell className="text-right">
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="destructive" size="sm">Akhiri Perang</Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Hentikan Peperangan?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Tindakan ini akan mengakhiri perang antara {war.alliance1Name} dan {war.alliance2Name} secara paksa.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Batal</AlertDialogCancel>
                                                            <AlertDialogAction
                                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                                onClick={() => handleEndWar(war.id)}
                                                            >
                                                                Ya, Akhiri Perang
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <p className="text-sm text-center text-muted-foreground">Tidak ada perang yang sedang berlangsung.</p>
                        )}
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="users">
                    <Card>
                      <CardHeader>
                        <CardTitle>Manajemen Pengguna</CardTitle>
                        <CardDescription>
                          Aktifkan, nonaktifkan, atau edit akun pengguna. Pengguna yang dinonaktifkan tidak akan bisa masuk.
                        </CardDescription>
                         <div className="relative pt-4">
                            <Input
                                placeholder="Cari nama pride atau email..."
                                value={userSearchQuery}
                                onChange={(e) => {
                                setUserSearchQuery(e.target.value);
                                setUserCurrentPage(1);
                                }}
                                className="w-full max-w-sm"
                            />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Nama Pride</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Koordinat</TableHead>
                              <TableHead>Pride</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Peran</TableHead>
                              <TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {isLoadingUsers ? (
                              <TableRow>
                                <TableCell colSpan={7} className="text-center">Memuat pengguna...</TableCell>
                              </TableRow>
                            ) : currentUsersToDisplay.length > 0 ? (
                              currentUsersToDisplay.map((u) => {
                                const isEnabled = u.status === undefined || u.status === 'active';
                                const isAdmin = u.role === 'admin';
                                return (
                                <TableRow key={u.id} className={isAdmin ? 'bg-primary/10' : ''}>
                                  <TableCell className="flex items-center gap-2">
                                    {u.prideName}
                                    {isAdmin && <Crown className="h-4 w-4 text-primary" />}
                                  </TableCell>
                                  <TableCell>{u.email}</TableCell>
                                  <TableCell className="font-mono">{`(${u.coordinates?.x ?? 'N/A'}, ${u.coordinates?.y ?? 'N/A'})`}</TableCell>
                                  <TableCell>{(u.pride ?? 0).toLocaleString()}</TableCell>
                                  <TableCell>
                                    <Badge variant={isEnabled ? 'secondary' : 'destructive'}>
                                      {isEnabled ? 'Aktif' : 'Nonaktif'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={isAdmin ? 'default' : 'outline'}>
                                      {u.role}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                       <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenEditUserDialog(u)}>
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Edit Pengguna</p>
                                        </TooltipContent>
                                      </Tooltip>

                                      {u.id === user.uid || isAdmin ? (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span>
                                              <Button variant="outline" size="icon" disabled>
                                                <Ban className="h-4 w-4" />
                                              </Button>
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Anda tidak dapat mengubah status admin.</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      ) : (
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button variant={isEnabled ? 'destructive' : 'secondary'}>
                                              {isEnabled ? 'Nonaktifkan' : 'Aktifkan'}
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                Tindakan ini akan {isEnabled ? 'mencegah' : 'mengizinkan'} pengguna '{u.prideName}' untuk masuk ke dalam permainan.
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel>Batal</AlertDialogCancel>
                                              <AlertDialogAction onClick={() => handleToggleUserStatus(u.id)}>
                                                Ya, {isEnabled ? 'Nonaktifkan' : 'Aktifkan'}
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )})
                            ) : (
                              <TableRow>
                                <TableCell colSpan={7} className="text-center">Tidak ada pengguna yang cocok.</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </CardContent>
                       {totalUserPages > 1 && (
                        <CardFooter className="flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">
                                Menampilkan <strong>{indexOfFirstUser + 1}-{Math.min(indexOfLastUser, filteredManageableUsers.length)}</strong> dari <strong>{filteredManageableUsers.length}</strong> pengguna
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setUserCurrentPage(prev => Math.max(prev - 1, 1))}
                                  disabled={userCurrentPage === 1}
                                >
                                  Sebelumnya
                                </Button>
                                <span className="text-sm text-muted-foreground">
                                    Halaman {userCurrentPage} / {totalUserPages > 0 ? totalUserPages : 1}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setUserCurrentPage(prev => Math.min(prev + 1, totalUserPages))}
                                  disabled={userCurrentPage >= totalUserPages}
                                >
                                  Selanjutnya
                                </Button>
                            </div>
                        </CardFooter>
                       )}
                    </Card>
                </TabsContent>
                <TabsContent value="danger">
                  <Card className="border-destructive">
                    <CardHeader>
                      <CardTitle className="text-destructive">Area Berbahaya</CardTitle>
                      <CardDescription>
                        Tindakan di area ini bersifat permanen dan tidak dapat diurungkan. Lanjutkan dengan hati-hati.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center gap-4">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" disabled={isResetting}>
                            {isResetting ? 'Mereset...' : 'Reset Permainan'}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Apakah Anda benar-benar yakin?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tindakan ini akan mengatur ulang semua data pemain (kecuali akun admin Anda) ke keadaan awal, seolah-olah mereka baru mendaftar. Ini juga akan menghapus semua antrian konstruksi dan pelatihan. Tindakan ini tidak dapat diurungkan.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Batal</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleResetGame}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Ya, Reset Permainan
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" disabled={isResettingAlliances}>
                            {isResettingAlliances ? 'Mereset Aliansi...' : 'Reset Aliansi'}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Reset Semua Aliansi?</AlertDialogTitle>
                            <AlertDialogDescription>
                               Tindakan ini akan menghapus semua pemain dari aliansi mereka saat ini dan menghapus semua data pemungutan suara. Pemain akan secara otomatis bergabung kembali dengan aliansi acak saat mereka masuk berikutnya. Ini TIDAK akan mereset sumber daya atau bangunan pemain.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Batal</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleResetAlliances}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Ya, Reset Aliansi
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                           <Button variant="destructive" disabled={isDeletingPlayers}>
                            {isDeletingPlayers ? 'Menghapus Pemain...' : 'Hapus Semua Pemain'}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Hapus Semua Akun Pemain?</AlertDialogTitle>
                            <AlertDialogDescription>
                               Tindakan ini akan menghapus semua data pemain non-admin dari database DAN menghapus akun autentikasi mereka secara permanen. Pemain yang dihapus harus mendaftar ulang. Tindakan ini tidak dapat diurungkan.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Batal</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleDeleteAllPlayers}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Ya, Hapus Semua Pemain
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </CardContent>
                  </Card>
                </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Gelar: {editingTitle?.name}</DialogTitle>
            <DialogDescription>
              Ubah detail gelar di bawah ini. Perubahan akan berlaku untuk semua pemain.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateTitle} className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-title-name">Nama Gelar</Label>
              <Input 
                id="edit-title-name" 
                value={editFormData.name ?? ''} 
                onChange={e => setEditFormData(prev => ({...prev, name: e.target.value}))} 
                required 
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-title-pride">Pride Dibutuhkan</Label>
              <Input 
                id="edit-title-pride" 
                type="number" 
                value={editFormData.prideRequired ?? 0} 
                onChange={e => setEditFormData(prev => ({...prev, prideRequired: Number(e.target.value)}))} 
                min="0" 
                required 
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-title-attack">Bonus Serang (%)</Label>
              <Input 
                id="edit-title-attack" 
                type="number" 
                value={editFormData.attackBonus ?? 0} 
                onChange={e => setEditFormData(prev => ({...prev, attackBonus: Number(e.target.value)}))} 
                min="0" 
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-title-defense">Bonus Bertahan (%)</Label>
              <Input 
                id="edit-title-defense" 
                type="number" 
                value={editFormData.defenseBonus ?? 0} 
                onChange={e => setEditFormData(prev => ({...prev, defenseBonus: Number(e.target.value)}))} 
                min="0" 
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-title-resource">Bonus Sumber Daya (%)</Label>
              <Input 
                id="edit-title-resource" 
                type="number" 
                value={editFormData.resourceBonus ?? 0} 
                onChange={e => setEditFormData(prev => ({...prev, resourceBonus: Number(e.target.value)}))} 
                min="0" 
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>Batal</Button>
              <Button type="submit" disabled={isUpdatingTitle}>
                {isUpdatingTitle ? 'Menyimpan...' : 'Simpan Perubahan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={isEditUserDialogOpen} onOpenChange={setIsEditUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Pengguna: {editingUser?.prideName}</DialogTitle>
            <DialogDescription>
              Ubah detail data pengguna di bawah ini. Hati-hati saat mengubah nilai pride atau koordinat.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateUser} className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-pride-name">Nama Pride</Label>
              <Input 
                id="edit-pride-name" 
                value={editUserFormData.prideName ?? ''} 
                onChange={e => setEditUserFormData(prev => ({...prev, prideName: e.target.value}))} 
                required 
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-pride-value">Nilai Pride</Label>
              <Input
                id="edit-pride-value"
                type="number"
                value={editUserFormData.pride ?? 0}
                onChange={e => setEditUserFormData(prev => ({ ...prev, pride: Number(e.target.value) }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-coord-x">Koordinat X</Label>
                  <Input 
                    id="edit-coord-x" 
                    type="number" 
                    value={editUserFormData.coordinates?.x ?? 0} 
                    onChange={e => setEditUserFormData(prev => ({ ...prev, coordinates: { ...prev.coordinates, x: Number(e.target.value), y: prev.coordinates?.y ?? 0 } }))}
                    required 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-coord-y">Koordinat Y</Label>
                  <Input 
                    id="edit-coord-y" 
                    type="number" 
                    value={editUserFormData.coordinates?.y ?? 0} 
                    onChange={e => setEditUserFormData(prev => ({ ...prev, coordinates: { ...prev.coordinates, y: Number(e.target.value), x: prev.coordinates?.x ?? 0 } }))}
                    required 
                  />
                </div>
            </div>
            <div className="grid gap-2">
                <Label htmlFor="edit-alliance">Aliansi</Label>
                <Select
                    value={editUserFormData.allianceId ?? 'none'}
                    onValueChange={(value) => setEditUserFormData(prev => ({ ...prev, allianceId: value === 'none' ? null : value }))}
                >
                    <SelectTrigger id="edit-alliance">
                        <SelectValue placeholder="Pilih Aliansi..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">Tidak Ada Aliansi</SelectItem>
                        {alliances.map(alliance => (
                            <SelectItem key={alliance.id} value={alliance.id}>
                                {alliance.name} [{alliance.tag}]
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditUserDialogOpen(false)}>Batal</Button>
              <Button type="submit" disabled={isUpdatingUser}>
                {isUpdatingUser ? 'Menyimpan...' : 'Simpan Perubahan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

    