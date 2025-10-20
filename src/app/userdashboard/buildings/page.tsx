
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

interface BuildingCosts {
    residence: number;
    farm: number;
    fort: number;
    university: number;
    barracks: number;
    mobility: number;
    tambang: number;
}
interface BuildingCounts {
    residence: number;
    farm: number;
    fort: number;
    university: number;
    barracks: number;
    mobility: number;
    tambang: number;
}

interface ConstructionJob {
    id: string;
    buildingId: keyof BuildingCounts;
    amount: number;
    completionTime: Timestamp;
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
  residence: 'Rumah',
  farm: 'Sawah',
  fort: 'Benteng',
  university: 'Kampus',
  barracks: 'Barak Pasukan',
  mobility: 'Mobilitas Pasukan',
  tambang: 'Tambang'
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

export default function BuildingsPage() {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [buildingCosts, setBuildingCosts] = useState<BuildingCosts>(defaultBuildingCosts);
  const [constructionTime, setConstructionTime] = useState(5); // default 5 hours
  const [constructionBonus, setConstructionBonus] = useState(5); // default 5%
  const [order, setOrder] = useState<{ [key: string]: number }>({});
  const [demolishOrder, setDemolishOrder] = useState<{ [key: string]: number }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isDemolishing, setIsDemolishing] = useState(false);
  const [isDemolishDialogOpen, setIsDemolishDialogOpen] = useState(false);
  const [constructionQueue, setConstructionQueue] = useState<ConstructionJob[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState(true);
  
  useEffect(() => {
    const fetchGameSettings = async () => {
        const costsDocRef = doc(db, 'game-settings', 'game-costs');
        const costsDocSnap = await getDoc(costsDocRef);
        if (costsDocSnap.exists() && costsDocSnap.data().buildings) {
            setBuildingCosts(costsDocSnap.data().buildings);
        }

        const timingDocRef = doc(db, 'game-settings', 'timing-rules');
        const timingDocSnap = await getDoc(timingDocRef);
        if (timingDocSnap.exists()) {
            const data = timingDocSnap.data();
            if (data.constructionTimeInHours !== undefined) {
                setConstructionTime(data.constructionTimeInHours);
            }
        }
        
        const effectsDocRef = doc(db, 'game-settings', 'building-effects');
        const effectsDocSnap = await getDoc(effectsDocRef);
        if (effectsDocSnap.exists() && effectsDocSnap.data().university) {
            setConstructionBonus(effectsDocSnap.data().university.constructionBonus ?? 5);
        }
    };
    fetchGameSettings();
  }, []);

  useEffect(() => {
    if (!user) return;
    setIsLoadingQueue(true);
    const q = query(collection(db, 'constructionQueue'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const jobs = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as ConstructionJob));
        jobs.sort((a,b) => a.completionTime.toMillis() - b.completionTime.toMillis());
        setConstructionQueue(jobs);
        setIsLoadingQueue(false);
    }, (error) => {
        console.error("Error fetching construction queue:", error);
        toast({ title: "Gagal memuat antrian", variant: "destructive" });
        setIsLoadingQueue(false);
    });

    return () => unsubscribe();
  }, [user, toast]);


  const ownedBuildings = useMemo(() => {
    return userProfile?.buildings ?? { residence: 0, farm: 0, fort: 0, university: 0, barracks: 0, mobility: 0, tambang: 0 };
  }, [userProfile?.buildings]);
  
  const landUsedByOwned = useMemo(() => {
    return Object.values(ownedBuildings).reduce((acc, count) => acc + count, 0);
  }, [ownedBuildings]);

  const landUsedByQueue = useMemo(() => {
    return constructionQueue.reduce((acc, job) => acc + job.amount, 0);
  }, [constructionQueue]);
  
  const landUsed = landUsedByOwned + landUsedByQueue;
  const landAvailable = userProfile?.land ?? 0;
  const landRemaining = landAvailable - landUsed;

  const handleOrderChange = (buildingId: string, value: string) => {
      const amount = Number(value);
      if (!isNaN(amount) && amount >= 0) {
          setOrder(prev => ({...prev, [buildingId]: amount}));
      }
  };

  const handleDemolishOrderChange = (buildingId: string, value: string) => {
    const amount = Number(value);
    if (!isNaN(amount) && amount >= 0) {
        setDemolishOrder(prev => ({ ...prev, [buildingId]: amount }));
    }
  };

  const handleOrderConstruction = async () => {
    if (!user || !userProfile) return;
    setIsLoading(true);

    let totalCost = 0;
    let totalBuildingsOrdered = 0;
    let orderSummary = '';

    for (const buildingId in order) {
        const amount = order[buildingId];
        if (amount > 0) {
            const costPerUnit = buildingCosts[buildingId as keyof BuildingCosts] ?? 0;
            
            if (isNaN(costPerUnit) || costPerUnit < 0) {
                console.error(`Invalid cost for ${buildingId}:`, costPerUnit);
                toast({
                    title: "Gagal Membangun",
                    description: `Ada kesalahan konfigurasi biaya untuk bangunan ini. Harap hubungi admin.`,
                    variant: "destructive"
                });
                setIsLoading(false);
                return;
            }
            totalCost += (amount * costPerUnit);
            totalBuildingsOrdered += amount;
            orderSummary += `${amount.toLocaleString()} ${buildingNameMap[buildingId] || buildingId}, `;
        }
    }

    if (totalBuildingsOrdered === 0) {
        toast({ title: "Tidak ada pesanan", description: "Silakan masukkan jumlah bangunan yang ingin Anda bangun." });
        setIsLoading(false);
        return;
    }
    
    if ((userProfile.money ?? 0) < totalCost) {
        toast({ title: "Uang tidak cukup", description: `Anda membutuhkan ${totalCost.toLocaleString()} uFtB.`, variant: "destructive" });
        setIsLoading(false);
        return;
    }

    if (landRemaining < totalBuildingsOrdered) {
        toast({ title: "Tanah tidak cukup", description: `Anda hanya memiliki ${landRemaining.toLocaleString()} tanah tersisa.`, variant: "destructive" });
        setIsLoading(false);
        return;
    }

    try {
        const batch = writeBatch(db);
        const userDocRef = doc(db, 'users', user.uid);
        batch.update(userDocRef, { money: increment(-totalCost) });
        
        const totalBonusPercent = (ownedBuildings?.university ?? 0) * constructionBonus;
        const timeMultiplier = Math.max(0.1, 1 - (totalBonusPercent / 100));
        const durationPerJobInMs = constructionTime * timeMultiplier * 60 * 60 * 1000;

        for (const buildingId in order) {
            const amount = order[buildingId];
            if (amount > 0) {
                const jobCompletionTime = new Date(Date.now() + durationPerJobInMs);
                
                const jobRef = doc(collection(db, 'constructionQueue'));
                batch.set(jobRef, {
                    userId: user.uid,
                    buildingId,
                    amount: amount,
                    completionTime: Timestamp.fromDate(jobCompletionTime),
                });
            }
        }

        // Add to activity log
        const logRef = doc(collection(db, "activityLog"));
        batch.set(logRef, {
            userId: user.uid,
            prideName: userProfile.prideName,
            type: "build",
            message: `Memulai konstruksi: ${orderSummary.slice(0, -2)}.`,
            timestamp: serverTimestamp(),
        });

        await batch.commit();
        toast({ title: "Ditambahkan ke Antrian Konstruksi", description: "Bangunan Anda sedang dibangun dan akan selesai sesuai waktu yang ditentukan." });
        setOrder({});
    } catch (error) {
        console.error("Error ordering construction:", error);
        toast({ title: "Gagal memulai konstruksi", variant: "destructive" });
    } finally {
        setIsLoading(false);
    }
  };

  const handleDemolish = async () => {
    if (!user || !userProfile) return;
    setIsDemolishing(true);

    const batch = writeBatch(db);
    const userDocRef = doc(db, 'users', user.uid);
    let totalDemolished = 0;
    let isValid = true;

    for (const buildingId in demolishOrder) {
        const amount = demolishOrder[buildingId];
        if (amount > 0) {
            const owned = ownedBuildings[buildingId as keyof BuildingCounts] ?? 0;
            if (amount > owned) {
                toast({ title: "Jumlah tidak valid", description: `Anda tidak dapat menghancurkan lebih banyak ${buildingNameMap[buildingId]} daripada yang Anda miliki.`, variant: "destructive" });
                isValid = false;
                break;
            }
            batch.update(userDocRef, { [`buildings.${buildingId}`]: increment(-amount) });
            totalDemolished += amount;
        }
    }

    if (!isValid) {
        setIsDemolishing(false);
        return;
    }

    if (totalDemolished === 0) {
        toast({ title: "Tidak ada pesanan", description: "Masukkan jumlah bangunan yang akan dihancurkan." });
        setIsDemolishing(false);
        return;
    }

    try {
        await batch.commit();
        toast({ title: "Bangunan Dihancurkan", description: `Sebanyak ${totalDemolished} bangunan telah berhasil dihancurkan.` });
        setDemolishOrder({});
        setIsDemolishDialogOpen(false);
    } catch (error) {
        console.error("Error demolishing buildings:", error);
        toast({ title: "Gagal menghancurkan bangunan", variant: "destructive" });
    } finally {
        setIsDemolishing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="text-center p-4">
        <CardTitle className="text-xl">Bangunan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-4">
        <Card className="bg-card/50">
          <CardContent className="p-4 text-sm space-y-1">
            <div className="flex justify-between"><span>Total Tanah:</span> <span>{(landAvailable).toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Tanah Terpakai (Dimiliki + Antrian):</span> <span>{landUsed.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Tanah Tersedia untuk Dibangun:</span> <span className={landRemaining < 0 ? 'text-destructive' : ''}>{landRemaining.toLocaleString()}</span></div>
          </CardContent>
        </Card>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Nama Bangunan</TableHead>
                <TableHead className="text-right">Dimiliki</TableHead>
                <TableHead className="text-right whitespace-nowrap">Harga/Bangunan</TableHead>
                <TableHead className="text-center w-[100px]">Pesan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buildingDefinitions.map((building) => {
                const owned = ownedBuildings?.[building.id as keyof BuildingCounts] ?? 0;
                return (
                  <TableRow key={building.id}>
                    <TableCell>{building.name}</TableCell>
                    <TableCell className="text-right">{owned.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{(buildingCosts[building.id as keyof BuildingCosts] ?? 0).toLocaleString()} uFtB</TableCell>
                    <TableCell>
                      <Input 
                        type="number" 
                        placeholder="0"
                        value={order[building.id] || ''}
                        onChange={(e) => handleOrderChange(building.id, e.target.value)}
                        className="h-8 w-20 text-center bg-input/50 mx-auto"
                        min="0"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        
        <div className="space-y-4 pt-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleOrderConstruction} disabled={isLoading}>
                {isLoading ? 'Mengirim ke Antrian...' : 'Pesan Konstruksi'}
            </Button>
            
            <Dialog open={isDemolishDialogOpen} onOpenChange={setIsDemolishDialogOpen}>
                <DialogTrigger asChild>
                    <Button variant="destructive" className="w-full">Hancurkan Bangunan</Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Hancurkan Bangunan</DialogTitle>
                        <DialogDescription>
                            Masukkan jumlah bangunan yang ingin Anda hancurkan. Tindakan ini instan dan tidak dapat diurungkan.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {buildingDefinitions.map(b => (
                            <div key={b.id} className="flex items-center justify-between">
                                <Label htmlFor={`demolish-${b.id}`}>{b.name} (Dimiliki: {ownedBuildings[b.id as keyof BuildingCounts]?.toLocaleString() ?? 0})</Label>
                                <Input
                                    id={`demolish-${b.id}`}
                                    type="number"
                                    placeholder="0"
                                    value={demolishOrder[b.id] || ''}
                                    onChange={(e) => handleDemolishOrderChange(b.id, e.target.value)}
                                    className="h-8 w-24 text-center"
                                    min="0"
                                    max={ownedBuildings[b.id as keyof BuildingCounts] ?? 0}
                                />
                            </div>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsDemolishDialogOpen(false)}>Batal</Button>
                        <Button variant="destructive" onClick={handleDemolish} disabled={isDemolishing}>
                            {isDemolishing ? "Menghancurkan..." : "Hancurkan"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
          </div>
        </div>
        <Separator />
        <div>
            <h3 className="text-lg mb-2 text-center">Antrian Konstruksi</h3>
            {isLoadingQueue ? (
                <p className="text-sm text-muted-foreground text-center">Memuat antrian...</p>
            ) : constructionQueue.length > 0 ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Bangunan</TableHead>
                            <TableHead className="text-right">Jumlah</TableHead>
                            <TableHead className="text-right">Selesai Dalam</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {constructionQueue.map(job => (
                            <TableRow key={job.id}>
                                <TableCell>{buildingNameMap[job.buildingId]}</TableCell>
                                <TableCell className="text-right">{job.amount.toLocaleString()}</TableCell>
                                <TableCell className="text-right">
                                    <Countdown completionTime={job.completionTime} />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            ) : (
                <p className="text-sm text-muted-foreground text-center">Tidak ada konstruksi yang sedang berjalan.</p>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
