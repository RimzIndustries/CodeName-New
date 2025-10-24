
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useState, useMemo } from 'react';
import { doc, getDoc, updateDoc, increment, collection, writeBatch, Timestamp, addDoc, query, where, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { differenceInSeconds } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


// --- Building-related Interfaces and Constants ---
interface BuildingCosts {
    residence: number; farm: number; fort: number; university: number;
    barracks: number; mobility: number; tambang: number;
}
interface BuildingCounts {
    residence: number; farm: number; fort: number; university: number;
    barracks: number; mobility: number; tambang: number;
}
interface ConstructionJob {
    id: string; buildingId: keyof BuildingCounts; amount: number; completionTime: Timestamp;
}
const defaultBuildingCosts: BuildingCosts = { residence: 1000, farm: 1200, fort: 2500, university: 5000, barracks: 1500, mobility: 1000, tambang: 2000 };
const buildingDefinitions = [
  { id: 'residence', name: 'Rumah', description: 'Menambah kapasitas dan menghasilkan pengangguran.' },
  { id: 'farm', name: 'Sawah', description: 'Menghasilkan makanan dan pengangguran.' },
  { id: 'fort', name: 'Benteng', description: 'Meningkatkan pertahanan dan menghasilkan pengangguran.' },
  { id: 'university', name: 'Kampus', description: 'Meningkatkan efektivitas pasukan elit dan menghasilkan pengangguran.' },
  { id: 'barracks', name: 'Barak Pasukan', description: 'Mempercepat pelatihan pasukan dan menghasilkan pengangguran.' },
  { id: 'mobility', name: 'Mobilitas Pasukan', description: 'Meningkatkan bonus serangan dan menghasilkan pengangguran.' },
  { id: 'tambang', name: 'Tambang', description: 'Menghasilkan uang dan menghasilkan pengangguran.' },
];
const buildingNameMap: { [key: string]: string } = {
  residence: 'Rumah', farm: 'Sawah', fort: 'Benteng', university: 'Kampus',
  barracks: 'Barak Pasukan', mobility: 'Mobilitas Pasukan', tambang: 'Tambang'
};

// --- Barracks-related Interfaces and Constants ---
interface UnitCosts {
    attack: number; defense: number; elite: number; raider: number; spy: number;
}
interface UnitCounts {
    attack: number; defense: number; elite: number; raider: number; spy: number;
}
interface TrainingJob {
    id: string; userId: string; unitId: keyof UnitCounts; amount: number; completionTime: Timestamp;
}
const defaultUnitCosts: UnitCosts = { attack: 350, defense: 350, elite: 950, raider: 500, spy: 700 };
const unitDefinitions = [
  { id: 'attack', name: 'Pasukan Serang', stats: '(10/0)' },
  { id: 'defense', name: 'Pasukan Bertahan', stats: '(0/10)' },
  { id: 'elite', name: 'Pasukan Elit', stats: '(13/5)' },
  { id: 'raider', name: 'Perampok', stats: '(0/0)' },
  { id: 'spy', name: 'Mata-mata', stats: '(Intelligent)' },
];
const unitNameMap: { [key: string]: string } = {
  attack: 'Pasukan Serang', defense: 'Pasukan Bertahan', elite: 'Pasukan Elit',
  raider: 'Perampok', spy: 'Mata-mata'
};


function Countdown({ completionTime }: { completionTime: Timestamp }) {
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
        const timer = setInterval(() => {
            const now = new Date();
            const completion = completionTime.toDate();
            const secondsRemaining = differenceInSeconds(completion, now);

            if (secondsRemaining <= 0) {
                setTimeLeft('Selesai');
                clearInterval(timer);
            } else {
                const hours = Math.floor(secondsRemaining / 3600);
                const minutes = Math.floor((secondsRemaining % 3600) / 60);
                const seconds = secondsRemaining % 60;
                setTimeLeft(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [completionTime]);

    return <span>{timeLeft}</span>;
}

export default function ConstructionAndTrainingPage() {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  
  // Settings state
  const [buildingCosts, setBuildingCosts] = useState<BuildingCosts>(defaultBuildingCosts);
  const [unitCosts, setUnitCosts] = useState<UnitCosts>(defaultUnitCosts);
  const [constructionTime, setConstructionTime] = useState(5);
  const [trainingTime, setTrainingTime] = useState(2);
  const [constructionBonus, setConstructionBonus] = useState(5);
  const [barracksBonus, setBarracksBonus] = useState(50);
  
  // Building state
  const [buildOrder, setBuildOrder] = useState<{ [key: string]: number }>({});
  const [demolishOrder, setDemolishOrder] = useState<{ [key: string]: number }>({});
  const [isBuilding, setIsBuilding] = useState(false);
  const [isDemolishing, setIsDemolishing] = useState(false);
  const [isDemolishDialogOpen, setIsDemolishDialogOpen] = useState(false);
  const [constructionQueue, setConstructionQueue] = useState<ConstructionJob[]>([]);
  const [isLoadingConstructionQueue, setIsLoadingConstructionQueue] = useState(true);
  
  // Barracks state
  const [trainOrder, setTrainOrder] = useState<{ [key: string]: number }>({});
  const [dismissOrder, setDismissOrder] = useState<{ [key: string]: number }>({});
  const [isTraining, setIsTraining] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [isDismissDialogOpen, setIsDismissDialogOpen] = useState(false);
  const [trainingQueue, setTrainingQueue] = useState<TrainingJob[]>([]);
  const [isLoadingTrainingQueue, setIsLoadingTrainingQueue] = useState(true);
  
  useEffect(() => {
    const fetchGameSettings = async () => {
        const costsDocRef = doc(db, 'game-settings', 'game-costs');
        const timingDocRef = doc(db, 'game-settings', 'timing-rules');
        const effectsDocRef = doc(db, 'game-settings', 'building-effects');

        const [costsSnap, timingSnap, effectsSnap] = await Promise.all([
          getDoc(costsDocRef), getDoc(timingDocRef), getDoc(effectsDocRef)
        ]);

        if (costsSnap.exists()) {
            if (costsSnap.data().buildings) setBuildingCosts(costsSnap.data().buildings);
            if (costsSnap.data().units) setUnitCosts(costsSnap.data().units);
        }
        if (timingSnap.exists()) {
            const data = timingSnap.data();
            if (data.constructionTimeInHours !== undefined) setConstructionTime(data.constructionTimeInHours);
            if (data.trainingTimeInHours !== undefined) setTrainingTime(data.trainingTimeInHours);
        }
        if (effectsSnap.exists()) {
            const data = effectsSnap.data();
            if (data.university) setConstructionBonus(data.university.constructionBonus ?? 5);
            if (data.barracks) setBarracksBonus(data.barracks.trainingBonus ?? 50);
        }
    };
    fetchGameSettings();
  }, []);

  useEffect(() => {
    if (!user) return;
    setIsLoadingConstructionQueue(true);
    const q = query(collection(db, 'constructionQueue'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const jobs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ConstructionJob));
        jobs.sort((a,b) => a.completionTime.toMillis() - b.completionTime.toMillis());
        setConstructionQueue(jobs);
        setIsLoadingConstructionQueue(false);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setIsLoadingTrainingQueue(true);
    const q = query(collection(db, 'trainingQueue'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const jobs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TrainingJob));
        jobs.sort((a, b) => a.completionTime.toMillis() - b.completionTime.toMillis());
        setTrainingQueue(jobs);
        setIsLoadingTrainingQueue(false);
    });
    return () => unsubscribe();
  }, [user]);


  const ownedBuildings = useMemo(() => userProfile?.buildings ?? {}, [userProfile?.buildings]);
  const ownedUnits = useMemo(() => userProfile?.units ?? {}, [userProfile?.units]);
  
  const landUsedByOwned = useMemo(() => Object.values(ownedBuildings).reduce((acc, count) => acc + count, 0), [ownedBuildings]);
  const landUsedByQueue = useMemo(() => constructionQueue.reduce((acc, job) => acc + job.amount, 0), [constructionQueue]);
  const landUsed = landUsedByOwned + landUsedByQueue;
  const landAvailable = userProfile?.land ?? 0;
  const landRemaining = landAvailable - landUsed;

  const handleBuildOrderChange = (buildingId: string, value: string) => {
      const amount = Number(value);
      if (!isNaN(amount) && amount >= 0) setBuildOrder(prev => ({...prev, [buildingId]: amount}));
  };

  const handleDemolishOrderChange = (buildingId: string, value: string) => {
    const amount = Number(value);
    if (!isNaN(amount) && amount >= 0) setDemolishOrder(prev => ({ ...prev, [buildingId]: amount }));
  };
  
  const handleTrainOrderChange = (unitId: string, value: string) => {
    const amount = Number(value);
    if (!isNaN(amount) && amount >= 0) setTrainOrder(prev => ({ ...prev, [unitId]: amount }));
  };

  const handleDismissOrderChange = (unitId: string, value: string) => {
    const amount = Number(value);
    if (!isNaN(amount) && amount >= 0) setDismissOrder(prev => ({ ...prev, [unitId]: amount }));
  };

  const handleSetMaxTrain = (unitId: string) => {
    if (!userProfile) return;
    const costPerUnit = unitCosts[unitId as keyof UnitCosts];
    const maxFromMoney = costPerUnit > 0 ? Math.floor((userProfile.money ?? 0) / costPerUnit) : Infinity;
    const maxFromPopulation = userProfile.unemployed ?? 0;
    setTrainOrder(prev => ({ ...prev, [unitId]: Math.min(maxFromMoney, maxFromPopulation) }));
  };

  const handleOrderConstruction = async () => {
    if (!user || !userProfile) return;
    setIsBuilding(true);

    let totalCost = 0, totalBuildingsOrdered = 0, orderSummary = '';
    for (const buildingId in buildOrder) {
        const amount = buildOrder[buildingId];
        if (amount > 0) {
            totalCost += amount * (buildingCosts[buildingId as keyof BuildingCosts] ?? 0);
            totalBuildingsOrdered += amount;
            orderSummary += `${amount.toLocaleString()} ${buildingNameMap[buildingId] || buildingId}, `;
        }
    }

    if (totalBuildingsOrdered === 0) {
        toast({ title: "Tidak ada pesanan." });
        setIsBuilding(false); return;
    }
    if ((userProfile.money ?? 0) < totalCost) {
        toast({ title: "Uang tidak cukup.", variant: "destructive" });
        setIsBuilding(false); return;
    }
    if (landRemaining < totalBuildingsOrdered) {
        toast({ title: "Tanah tidak cukup.", variant: "destructive" });
        setIsBuilding(false); return;
    }

    try {
        const batch = writeBatch(db);
        const userDocRef = doc(db, 'users', user.uid);
        batch.update(userDocRef, { money: increment(-totalCost) });
        
        const totalBonusPercent = (ownedBuildings?.university ?? 0) * constructionBonus;
        const timeMultiplier = Math.max(0.1, 1 - (totalBonusPercent / 100));
        const durationPerJobInMs = constructionTime * timeMultiplier * 60 * 60 * 1000;

        for (const buildingId in buildOrder) {
            if (buildOrder[buildingId] > 0) {
                const jobCompletionTime = new Date(Date.now() + durationPerJobInMs);
                const jobRef = doc(collection(db, 'constructionQueue'));
                batch.set(jobRef, { userId: user.uid, buildingId, amount: buildOrder[buildingId], completionTime: Timestamp.fromDate(jobCompletionTime) });
            }
        }

        const logRef = doc(collection(db, "activityLog"));
        batch.set(logRef, { userId: user.uid, prideName: userProfile.prideName, type: "build", message: `Memulai konstruksi: ${orderSummary.slice(0, -2)}.`, timestamp: serverTimestamp() });
        
        await batch.commit();
        toast({ title: "Ditambahkan ke Antrian Konstruksi" });
        setBuildOrder({});
    } catch (error) {
        console.error("Error ordering construction:", error);
        toast({ title: "Gagal memulai konstruksi", variant: "destructive" });
    } finally {
        setIsBuilding(false);
    }
  };

  const handleDemolish = async () => {
    if (!user) return;
    setIsDemolishing(true);
    const batch = writeBatch(db);
    const userDocRef = doc(db, 'users', user.uid);
    let totalDemolished = 0;
    
    for (const buildingId in demolishOrder) {
        const amount = demolishOrder[buildingId];
        if (amount > 0) {
            if (amount > (ownedBuildings[buildingId as keyof BuildingCounts] ?? 0)) {
                toast({ title: "Jumlah tidak valid", variant: "destructive" });
                setIsDemolishing(false); return;
            }
            batch.update(userDocRef, { [`buildings.${buildingId}`]: increment(-amount) });
            totalDemolished += amount;
        }
    }
    
    if (totalDemolished === 0) {
        toast({ title: "Tidak ada pesanan." });
        setIsDemolishing(false); return;
    }

    try {
        await batch.commit();
        toast({ title: "Bangunan Dihancurkan" });
        setDemolishOrder({});
        setIsDemolishDialogOpen(false);
    } catch (error) {
        toast({ title: "Gagal menghancurkan", variant: "destructive" });
    } finally {
        setIsDemolishing(false);
    }
  };
  
  const handleTrainTroops = async () => {
    if (!user || !userProfile) return;
    setIsTraining(true);

    let totalCost = 0, totalUnemployedNeeded = 0, orderCount = 0, orderSummary = '';
    for (const unitId in trainOrder) {
        const amount = trainOrder[unitId];
        if (amount > 0) {
            totalCost += amount * (unitCosts[unitId as keyof UnitCosts] ?? 0);
            totalUnemployedNeeded += amount;
            orderCount++;
            orderSummary += `${amount.toLocaleString()} ${unitNameMap[unitId] || unitId}, `;
        }
    }

    if (orderCount === 0) {
        toast({ title: "Tidak ada pesanan." });
        setIsTraining(false); return;
    }
    if ((userProfile.money ?? 0) < totalCost) {
        toast({ title: "Uang tidak cukup.", variant: "destructive" });
        setIsTraining(false); return;
    }
    if ((userProfile.unemployed ?? 0) < totalUnemployedNeeded) {
        toast({ title: "Pengangguran tidak cukup.", variant: "destructive" });
        setIsTraining(false); return;
    }

    try {
        const batch = writeBatch(db);
        const userDocRef = doc(db, 'users', user.uid);
        batch.update(userDocRef, { money: increment(-totalCost), unemployed: increment(-totalUnemployedNeeded) });
        
        const totalBonusPercent = (userProfile.buildings?.barracks ?? 0) * barracksBonus;
        const timeMultiplier = Math.max(0.1, 1 - (totalBonusPercent / 100));
        const durationPerJobInMs = trainingTime * timeMultiplier * 60 * 60 * 1000;

        let lastCompletionTime = new Date();
        if (trainingQueue.length > 0) lastCompletionTime = trainingQueue[trainingQueue.length - 1].completionTime.toDate();

        for (const unitId in trainOrder) {
            if (trainOrder[unitId] > 0) {
                const jobStartTime = lastCompletionTime > new Date() ? lastCompletionTime : new Date();
                const jobCompletionTime = new Date(jobStartTime.getTime() + durationPerJobInMs);
                lastCompletionTime = jobCompletionTime;

                const jobRef = doc(collection(db, 'trainingQueue'));
                batch.set(jobRef, { userId: user.uid, unitId, amount: trainOrder[unitId], completionTime: Timestamp.fromDate(jobCompletionTime) });
            }
        }
        
        const logRef = doc(collection(db, "activityLog"));
        batch.set(logRef, { userId: user.uid, prideName: userProfile.prideName, type: "train", message: `Memulai pelatihan: ${orderSummary.slice(0, -2)}.`, timestamp: serverTimestamp() });
        
        await batch.commit();
        toast({ title: "Pasukan Ditambahkan ke Antrian" });
        setTrainOrder({});
    } catch (error) {
        toast({ title: "Gagal melatih", variant: "destructive" });
    } finally {
        setIsTraining(false);
    }
  };

  const handleDismissTroops = async () => {
    if (!user) return;
    setIsDismissing(true);
    let totalDismissed = 0;
    const updates: { [key: string]: any } = {};

    for (const unitId in dismissOrder) {
        const amount = dismissOrder[unitId];
        if (amount > 0) {
            if (amount > (ownedUnits[unitId as keyof UnitCounts] ?? 0)) {
                toast({ title: "Jumlah tidak valid.", variant: "destructive" });
                setIsDismissing(false); return;
            }
            updates[`units.${unitId}`] = increment(-amount);
            totalDismissed += amount;
        }
    }

    if (totalDismissed === 0) {
        toast({ title: "Tidak ada pesanan." });
        setIsDismissing(false); return;
    }
    updates.unemployed = increment(totalDismissed);

    try {
        await updateDoc(doc(db, 'users', user.uid), updates);
        toast({ title: "Pasukan Dipecat" });
        setDismissOrder({});
        setIsDismissDialogOpen(false);
    } catch (error) {
        toast({ title: "Gagal memecat", variant: "destructive" });
    } finally {
        setIsDismissing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="text-center p-4">
        <CardTitle className="text-xl">Konstruksi & Pelatihan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-4">
        <Tabs defaultValue="buildings">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="buildings">Bangunan</TabsTrigger>
            <TabsTrigger value="troops">Pasukan</TabsTrigger>
          </TabsList>
          
          {/* Buildings Tab */}
          <TabsContent value="buildings" className="space-y-6">
            <Card className="bg-card/50">
              <CardContent className="p-4 text-sm space-y-1">
                <div className="flex justify-between"><span>Total Tanah:</span> <span>{landAvailable.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Tanah Terpakai (Dimiliki + Antrian):</span> <span>{landUsed.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Tanah Tersedia:</span> <span className={landRemaining < 0 ? 'text-destructive' : ''}>{landRemaining.toLocaleString()}</span></div>
              </CardContent>
            </Card>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Bangunan</TableHead><TableHead className="text-right">Dimiliki</TableHead><TableHead className="text-right">Harga</TableHead><TableHead className="text-center w-[100px]">Pesan</TableHead></TableRow></TableHeader>
                <TableBody>
                  {buildingDefinitions.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.name}</TableCell>
                      <TableCell className="text-right">{(ownedBuildings[b.id as keyof BuildingCounts] ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{(buildingCosts[b.id as keyof BuildingCosts] ?? 0).toLocaleString()} uFtB</TableCell>
                      <TableCell><Input type="number" placeholder="0" value={buildOrder[b.id] || ''} onChange={(e) => handleBuildOrderChange(b.id, e.target.value)} className="h-8 w-20 text-center bg-input/50 mx-auto" min="0" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2 pt-4">
              <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleOrderConstruction} disabled={isBuilding}>{isBuilding ? 'Memesan...' : 'Pesan Konstruksi'}</Button>
              <Dialog open={isDemolishDialogOpen} onOpenChange={setIsDemolishDialogOpen}>
                  <DialogTrigger asChild><Button variant="destructive" className="w-full">Hancurkan</Button></DialogTrigger>
                  <DialogContent>
                      <DialogHeader><DialogTitle>Hancurkan Bangunan</DialogTitle><DialogDescription>Tindakan ini instan.</DialogDescription></DialogHeader>
                      <div className="space-y-4 py-4">
                          {buildingDefinitions.map(b => (<div key={b.id} className="flex items-center justify-between"><Label htmlFor={`demolish-${b.id}`}>{b.name} (Dimiliki: {ownedBuildings[b.id as keyof BuildingCounts]?.toLocaleString() ?? 0})</Label><Input id={`demolish-${b.id}`} type="number" placeholder="0" value={demolishOrder[b.id] || ''} onChange={(e) => handleDemolishOrderChange(b.id, e.target.value)} className="h-8 w-24 text-center" min="0" max={ownedBuildings[b.id as keyof BuildingCounts] ?? 0}/></div>))}
                      </div>
                      <DialogFooter><Button variant="ghost" onClick={() => setIsDemolishDialogOpen(false)}>Batal</Button><Button variant="destructive" onClick={handleDemolish} disabled={isDemolishing}>{isDemolishing ? "Menghancurkan..." : "Hancurkan"}</Button></DialogFooter>
                  </DialogContent>
              </Dialog>
            </div>
            
            <Separator />
            <div>
              <h3 className="text-lg mb-2 text-center">Antrian Konstruksi</h3>
              {isLoadingConstructionQueue ? <p className="text-center text-sm">Memuat...</p> : constructionQueue.length > 0 ? (
                  <Table><TableHeader><TableRow><TableHead>Bangunan</TableHead><TableHead className="text-right">Jumlah</TableHead><TableHead className="text-right">Selesai Dalam</TableHead></TableRow></TableHeader>
                    <TableBody>{constructionQueue.map(job => (<TableRow key={job.id}><TableCell>{buildingNameMap[job.buildingId]}</TableCell><TableCell className="text-right">{job.amount.toLocaleString()}</TableCell><TableCell className="text-right"><Countdown completionTime={job.completionTime} /></TableCell></TableRow>))}</TableBody>
                  </Table>
              ) : <p className="text-center text-sm">Tidak ada konstruksi berjalan.</p>}
            </div>
          </TabsContent>

          {/* Troops Tab */}
          <TabsContent value="troops" className="space-y-6">
            <Card className="bg-card/50">
              <CardContent className="p-4 text-sm"><div className="flex justify-between"><span>Pengangguran Tersedia:</span> <span>{(userProfile?.unemployed ?? 0).toLocaleString()}</span></div></CardContent>
            </Card>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Unit (Serang/Bertahan)</TableHead><TableHead className="text-right">Dimiliki</TableHead><TableHead className="text-right">Biaya</TableHead><TableHead className="text-center w-[150px]">Latih</TableHead></TableRow></TableHeader>
                <TableBody>
                  {unitDefinitions.map((unit) => (
                    <TableRow key={unit.id}>
                      <TableCell>{unit.name} <span className="text-muted-foreground">{unit.stats}</span></TableCell>
                      <TableCell className="text-right">{(ownedUnits[unit.id as keyof UnitCounts] ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{unitCosts[unit.id as keyof UnitCosts]} uFtB</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 justify-center">
                            <Input type="number" value={trainOrder[unit.id] || ''} onChange={(e) => handleTrainOrderChange(unit.id, e.target.value)} placeholder="0" className="h-8 w-16 text-center bg-input/50" min="0"/>
                            <Button size="sm" variant="outline" className="h-8 bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => handleSetMaxTrain(unit.id)}>Max</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2 pt-4">
              <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleTrainTroops} disabled={isTraining}>{isTraining ? 'Melatih...' : 'Latih Pasukan'}</Button>
              <Dialog open={isDismissDialogOpen} onOpenChange={setIsDismissDialogOpen}>
                <DialogTrigger asChild><Button variant="destructive" className="w-full">Pecat Pasukan</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Pecat Pasukan</DialogTitle><DialogDescription>Tindakan ini instan.</DialogDescription></DialogHeader>
                  <div className="space-y-4 py-4">
                      {unitDefinitions.map(unit => (<div key={unit.id} className="flex items-center justify-between"><Label htmlFor={`dismiss-${unit.id}`}>{unit.name} (Dimiliki: {(ownedUnits[unit.id as keyof UnitCounts] ?? 0).toLocaleString()})</Label><Input id={`dismiss-${unit.id}`} type="number" placeholder="0" value={dismissOrder[unit.id] || ''} onChange={(e) => handleDismissOrderChange(unit.id, e.target.value)} className="h-8 w-24 text-center" min="0" max={ownedUnits[unit.id as keyof UnitCounts] ?? 0}/></div>))}
                  </div>
                  <DialogFooter><Button variant="ghost" onClick={() => setIsDismissDialogOpen(false)}>Batal</Button><Button variant="destructive" onClick={handleDismissTroops} disabled={isDismissing}>{isDismissing ? 'Memecat...' : 'Pecat'}</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            
            <Separator />
            <div>
              <h3 className="text-lg mb-2 text-center">Antrian Pelatihan</h3>
              {isLoadingTrainingQueue ? <p className="text-center text-sm">Memuat...</p> : trainingQueue.length > 0 ? (
                <Table><TableHeader><TableRow><TableHead>Pasukan</TableHead><TableHead className="text-right">Jumlah</TableHead><TableHead className="text-right">Selesai Dalam</TableHead></TableRow></TableHeader>
                  <TableBody>{trainingQueue.map(job => (<TableRow key={job.id}><TableCell>{unitNameMap[job.unitId]}</TableCell><TableCell className="text-right">{job.amount.toLocaleString()}</TableCell><TableCell className="text-right"><Countdown completionTime={job.completionTime} /></TableCell></TableRow>))}</TableBody>
                </Table>
              ) : <p className="text-center text-sm">Tidak ada pelatihan berjalan.</p>}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
