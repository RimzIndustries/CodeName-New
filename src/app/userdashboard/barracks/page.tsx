
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useState, useMemo } from 'react';
import { doc, getDoc, updateDoc, increment, collection, writeBatch, Timestamp, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';

interface UnitCosts {
    attack: number;
    defense: number;
    elite: number;
    raider: number;
}
interface UnitCounts {
    attack: number;
    defense: number;
    elite: number;
    raider: number;
}

const defaultUnitCosts: UnitCosts = { attack: 350, defense: 350, elite: 950, raider: 500 };

const unitDefinitions = [
  { id: 'attack', name: 'Pasukan Serang', stats: '(10/0)' },
  { id: 'defense', name: 'Pasukan Bertahan', stats: '(0/10)' },
  { id: 'elite', name: 'Pasukan Elit', stats: '(13/5)' },
  { id: 'raider', name: 'Perampok', stats: '(0/0)' },
];

const unitNameMap: { [key: string]: string } = {
  attack: 'Pasukan Serang',
  defense: 'Pasukan Bertahan',
  elite: 'Pasukan Elit',
  raider: 'Perampok'
};


export default function BarracksPage() {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [unitCosts, setUnitCosts] = useState<UnitCosts>(defaultUnitCosts);
  const [trainingTime, setTrainingTime] = useState(2); // default 2 hours
  const [barracksBonus, setBarracksBonus] = useState(50); // default 50%
  const [trainOrder, setTrainOrder] = useState<{ [key: string]: number }>({});
  const [dismissOrder, setDismissOrder] = useState<{ [key: string]: number }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [isDismissDialogOpen, setIsDismissDialogOpen] = useState(false);

  useEffect(() => {
    const fetchGameSettings = async () => {
        const costsDocRef = doc(db, 'game-settings', 'game-costs');
        const costsDocSnap = await getDoc(costsDocRef);
        if (costsDocSnap.exists() && costsDocSnap.data().units) {
            setUnitCosts(costsDocSnap.data().units);
        }

        const timingDocRef = doc(db, 'game-settings', 'timing-rules');
        const timingDocSnap = await getDoc(timingDocRef);
        if (timingDocSnap.exists()) {
          const data = timingDocSnap.data();
          if (data.trainingTimeInHours !== undefined) {
              setTrainingTime(data.trainingTimeInHours);
          }
        }
        
        const effectsDocRef = doc(db, 'game-settings', 'building-effects');
        const effectsDocSnap = await getDoc(effectsDocRef);
        if (effectsDocSnap.exists() && effectsDocSnap.data().barracks) {
            setBarracksBonus(effectsDocSnap.data().barracks.trainingBonus);
        }
    };
    fetchGameSettings();
  }, []);

  const ownedUnits = useMemo(() => {
    return userProfile?.units ?? { attack: 0, defense: 0, elite: 0, raider: 0 };
  }, [userProfile?.units]);

  const handleTrainOrderChange = (unitId: string, value: string) => {
    const amount = Number(value);
    if (!isNaN(amount) && amount >= 0) {
        setTrainOrder(prev => ({ ...prev, [unitId]: amount }));
    }
  };

  const handleDismissOrderChange = (unitId: string, value: string) => {
    const amount = Number(value);
    if (!isNaN(amount) && amount >= 0) {
        setDismissOrder(prev => ({ ...prev, [unitId]: amount }));
    }
  };

  const handleSetMax = (unitId: string) => {
    if (!userProfile) return;
    const costPerUnit = unitCosts[unitId as keyof UnitCosts];
    const maxFromMoney = costPerUnit > 0 ? Math.floor((userProfile.money ?? 0) / costPerUnit) : Infinity;
    const maxFromPopulation = userProfile.unemployed ?? 0;
    const maxTrainable = Math.min(maxFromMoney, maxFromPopulation);
    
    setTrainOrder(prev => ({ ...prev, [unitId]: maxTrainable }));
  };

  const handleTrainTroops = async () => {
    if (!user || !userProfile) return;
    setIsLoading(true);

    let totalCost = 0;
    let totalUnemployedNeeded = 0;
    let orderCount = 0;

    for (const unitId in trainOrder) {
        const amount = trainOrder[unitId];
        if (amount > 0) {
            const costPerUnit = unitCosts[unitId as keyof UnitCosts] ?? 0;

            if (isNaN(costPerUnit) || costPerUnit < 0) {
                toast({ title: "Gagal Melatih", description: `Ada kesalahan konfigurasi biaya untuk pasukan ini.`, variant: "destructive" });
                setIsLoading(false);
                return;
            }

            totalCost += amount * costPerUnit;
            totalUnemployedNeeded += amount;
            orderCount++;
        }
    }

    if (orderCount === 0) {
        toast({ title: "Tidak ada pesanan", description: "Silakan masukkan jumlah pasukan yang ingin Anda latih." });
        setIsLoading(false);
        return;
    }

    if ((userProfile.money ?? 0) < totalCost) {
        toast({ title: "Uang tidak cukup", description: `Anda membutuhkan ${totalCost.toLocaleString()} uFtB.`, variant: "destructive" });
        setIsLoading(false);
        return;
    }
    
    if ((userProfile.unemployed ?? 0) < totalUnemployedNeeded) {
        toast({ title: "Pengangguran tidak cukup", description: `Anda membutuhkan ${totalUnemployedNeeded.toLocaleString()} pengangguran.`, variant: "destructive" });
        setIsLoading(false);
        return;
    }

    try {
        const batch = writeBatch(db);
        const userDocRef = doc(db, 'users', user.uid);
        
        batch.update(userDocRef, {
            money: increment(-totalCost),
            unemployed: increment(-totalUnemployedNeeded)
        });
        
        // This is a simplified approach. Ideally, a backend function would handle queue processing.
        // For now, we add to a queue and the user must wait for a backend process to complete it.
        const totalBonusPercent = (userProfile.buildings?.barracks ?? 0) * barracksBonus;
        const timeMultiplier = Math.max(0.1, 1 - (totalBonusPercent / 100));
        const durationPerJobInHours = trainingTime * timeMultiplier;
        const durationPerJobInMs = durationPerJobInHours * 60 * 60 * 1000;

        for (const unitId in trainOrder) {
            const amount = trainOrder[unitId];
            if (amount > 0) {
                const jobCompletionTime = new Date(Date.now() + durationPerJobInMs);
                const jobRef = doc(collection(db, 'trainingQueue'));
                batch.set(jobRef, {
                    userId: user.uid,
                    unitId,
                    amount,
                    completionTime: Timestamp.fromDate(jobCompletionTime)
                });
            }
        }
        
        await batch.commit();
        
        toast({ title: "Pasukan Ditambahkan ke Antrian", description: "Pasukan Anda akan dilatih. Penyelesaian akan diproses di backend." });
        setTrainOrder({});
    } catch (error) {
        console.error("Error training troops:", error);
        toast({ title: "Gagal melatih pasukan", variant: "destructive" });
    } finally {
        setIsLoading(false);
    }
  };

  const handleDismissTroops = async () => {
    if (!user || !userProfile) return;
    setIsDismissing(true);

    let totalDismissed = 0;
    const updates: { [key: string]: any } = {};

    for (const unitId in dismissOrder) {
        const amount = dismissOrder[unitId];
        if (amount > 0) {
            if (amount > (ownedUnits[unitId as keyof UnitCounts] ?? 0)) {
                toast({ title: "Jumlah tidak valid", description: `Anda tidak dapat memecat lebih banyak ${unitNameMap[unitId]} daripada yang Anda miliki.`, variant: "destructive" });
                setIsDismissing(false);
                return;
            }
            updates[`units.${unitId}`] = increment(-amount);
            totalDismissed += amount;
        }
    }

    if (totalDismissed === 0) {
        toast({ title: "Tidak ada pesanan", description: "Masukkan jumlah pasukan yang akan dipecat." });
        setIsDismissing(false);
        return;
    }

    updates.unemployed = increment(totalDismissed);

    try {
        await updateDoc(doc(db, 'users', user.uid), updates);
        toast({ title: "Pasukan Dipecat", description: `${totalDismissed.toLocaleString()} pasukan telah kembali ke populasi pengangguran.`});
        setDismissOrder({});
        setIsDismissDialogOpen(false);
    } catch (error) {
        console.error("Error dismissing troops:", error);
        toast({ title: "Gagal memecat pasukan", variant: "destructive" });
    } finally {
        setIsDismissing(false);
    }
  };
  
  return (
    <Card>
      <CardHeader className="text-center p-4">
        <CardTitle className="text-xl">Barak</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-4">
        <Card className="bg-card/50">
          <CardContent className="p-4 text-sm space-y-1">
            <div className="flex justify-between"><span>Pengangguran Tersedia:</span> <span>{(userProfile?.unemployed ?? 0).toLocaleString()}</span></div>
          </CardContent>
        </Card>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Unit (Serang/Bertahan)</TableHead>
                <TableHead className="text-right">Dimiliki</TableHead>
                <TableHead className="text-right">Biaya</TableHead>
                <TableHead className="text-center w-[150px]">Latih</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unitDefinitions.map((unit) => {
                const owned = ownedUnits?.[unit.id as keyof UnitCounts] ?? 0;
                return (
                  <TableRow key={unit.id}>
                    <TableCell>{unit.name} <span className="text-muted-foreground">{unit.stats}</span></TableCell>
                    <TableCell className="text-right">{owned.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{unitCosts[unit.id as keyof UnitCosts]} uFtB</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 justify-center">
                          <Input 
                            type="number" 
                            value={trainOrder[unit.id] || ''}
                            onChange={(e) => handleTrainOrderChange(unit.id, e.target.value)}
                            placeholder="0"
                            className="h-8 w-16 text-center bg-input/50" 
                            min="0"
                          />
                          <Button size="sm" variant="outline" className="h-8 bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => handleSetMax(unit.id)}>Max</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        
        <div className="space-y-4 pt-4">
          <div className="flex flex-col sm:flex-row gap-2 pt-4">
            <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleTrainTroops} disabled={isLoading}>
                {isLoading ? 'Mengirim ke Antrian...' : 'Latih Pasukan'}
            </Button>
            
            <Dialog open={isDismissDialogOpen} onOpenChange={setIsDismissDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" className="w-full">Pecat Pasukan</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Pecat Pasukan</DialogTitle>
                  <DialogDescription>
                    Masukkan jumlah pasukan yang ingin Anda pecat. Mereka akan kembali ke populasi pengangguran. Tindakan ini instan.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    {unitDefinitions.map(unit => (
                        <div key={unit.id} className="flex items-center justify-between">
                            <Label htmlFor={`dismiss-${unit.id}`}>{unit.name} (Dimiliki: {(ownedUnits?.[unit.id as keyof UnitCounts] ?? 0).toLocaleString()})</Label>
                            <Input
                                id={`dismiss-${unit.id}`}
                                type="number"
                                placeholder="0"
                                value={dismissOrder[unit.id] || ''}
                                onChange={(e) => handleDismissOrderChange(unit.id, e.target.value)}
                                className="h-8 w-24 text-center"
                                min="0"
                                max={ownedUnits?.[unit.id as keyof UnitCounts] ?? 0}
                            />
                        </div>
                    ))}
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setIsDismissDialogOpen(false)}>Batal</Button>
                  <Button variant="destructive" onClick={handleDismissTroops} disabled={isDismissing}>
                    {isDismissing ? 'Memecat...' : 'Pecat'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

          </div>
        </div>
        <Separator />
        <div>
            <h3 className="text-lg mb-2 text-center">Antrian Pelatihan</h3>
            <p className="text-sm text-muted-foreground text-center">Tampilan antrian dinonaktifkan sementara untuk stabilitas. Pesanan Anda sedang diproses di backend.</p>
        </div>
      </CardContent>
    </Card>
  );
}
