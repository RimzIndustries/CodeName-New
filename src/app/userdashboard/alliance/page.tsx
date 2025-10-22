
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc, setDoc, updateDoc, getDoc, addDoc, serverTimestamp, getDocs, deleteDoc, or, Timestamp, increment, writeBatch } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Crown, Swords, Wrench, Hourglass, Handshake } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { differenceInSeconds } from 'date-fns';


interface AllianceMember {
  id: string;
  prideName: string;
  pride: number;
  land: number;
  province: string;
}

interface Vote {
    voterId: string;
    candidateId: string;
    allianceId: string;
}

interface Alliance {
    id: string;
    name: string;
    tag: string;
    coordinates: { x: number; y: number };
    logoUrl?: string;
}

interface GameTitle {
  id: string;
  name: string;
  prideRequired: number;
}

interface TransportJob {
    id: string;
    senderName: string;
    type: 'resource' | 'troops';
    payload: any;
    arrivalTime: Timestamp;
}

function WarCountdown({ expiryTimestamp }: { expiryTimestamp: Timestamp }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const expiry = expiryTimestamp.toDate();
      const secondsRemaining = differenceInSeconds(expiry, now);

      if (secondsRemaining <= 0) {
        setTimeLeft('Selesai');
        clearInterval(timer);
        // Data will be cleared by backend process, UI might linger for a bit.
      } else {
        const days = Math.floor(secondsRemaining / 86400);
        const hours = Math.floor((secondsRemaining % 86400) / 3600);
        const minutes = Math.floor((secondsRemaining % 3600) / 60);
        setTimeLeft(`${days}h ${String(hours).padStart(2, '0')}j ${String(minutes).padStart(2, '0')}m`);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [expiryTimestamp]);

  return <span className="font-mono text-destructive">{timeLeft}</span>;
}

function TransportCountdown({ arrivalTime }: { arrivalTime: Timestamp }) {
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
        const timer = setInterval(() => {
            const now = new Date();
            const arrival = arrivalTime.toDate();
            const secondsRemaining = differenceInSeconds(arrival, now);

            if (secondsRemaining <= 0) {
                setTimeLeft('Tiba');
                clearInterval(timer);
            } else {
                const hours = Math.floor(secondsRemaining / 3600);
                const minutes = Math.floor((secondsRemaining % 3600) / 60);
                const seconds = secondsRemaining % 60;
                setTimeLeft(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [arrivalTime]);

    return <span className="font-mono">{timeLeft}</span>;
}

export default function AlliancePage() {
    const { user, userProfile } = useAuth();
    const { toast } = useToast();

    const [alliance, setAlliance] = useState<Alliance | null>(null);
    const [members, setMembers] = useState<AllianceMember[]>([]);
    const [titles, setTitles] = useState<GameTitle[]>([]);
    const [votes, setVotes] = useState<Vote[]>([]);
    const [selectedCandidate, setSelectedCandidate] = useState<string>('');
    const [isVoting, setIsVoting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [votingPowerDivisor, setVotingPowerDivisor] = useState(100);

    const [leaderId, setLeaderId] = useState<string | null>(null);
    const [newAllianceName, setNewAllianceName] = useState('');
    const [newAllianceTag, setNewAllianceTag] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Logo edit state
    const [isLogoDialogOpen, setIsLogoDialogOpen] = useState(false);
    const [newLogoUrl, setNewLogoUrl] = useState('');
    const [isSavingLogo, setIsSavingLogo] = useState(false);
    
    // War state
    const [otherAlliances, setOtherAlliances] = useState<Alliance[]>([]);
    const [warTargetId, setWarTargetId] = useState('');
    const [isDeclaringWar, setIsDeclaringWar] = useState(false);
    const [activeWar, setActiveWar] = useState<any | null>(null);
    const [enemyAlliance, setEnemyAlliance] = useState<Alliance | null>(null);
    
    // Aid state
    const [isAidDialogOpen, setIsAidDialogOpen] = useState(false);
    const [aidTarget, setAidTarget] = useState<AllianceMember | null>(null);
    const [moneyToSend, setMoneyToSend] = useState(0);
    const [foodToSend, setFoodToSend] = useState(0);
    const [troopsToSend, setTroopsToSend] = useState<{ [key: string]: number }>({});
    const [isSendingAid, setIsSendingAid] = useState(false);
    const [incomingTransports, setIncomingTransports] = useState<TransportJob[]>([]);


    // Fetch titles
    useEffect(() => {
      const titlesCollectionRef = collection(db, 'titles');
      const unsubscribe = onSnapshot(titlesCollectionRef, (snapshot) => {
        const titlesList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as GameTitle[];
        titlesList.sort((a, b) => a.prideRequired - b.prideRequired);
        setTitles(titlesList);
      }, (error) => {
        console.error("Error fetching titles:", error);
      });
      return () => unsubscribe();
    }, []);
    
    // Fetch Game Mechanics
    useEffect(() => {
        const fetchMechanics = async () => {
            try {
                const mechanicsDocRef = doc(db, 'game-settings', 'game-mechanics');
                const docSnap = await getDoc(mechanicsDocRef);
                if (docSnap.exists() && docSnap.data().votingPowerDivisor) {
                    setVotingPowerDivisor(docSnap.data().votingPowerDivisor);
                }
            } catch (error) {
                console.error("Error fetching game mechanics:", error);
            }
        };
        fetchMechanics();
    }, []);

    useEffect(() => {
        if (!userProfile?.allianceId || !user) {
            setIsLoading(false);
            setAlliance(null);
            setMembers([]);
            setVotes([]);
            setIncomingTransports([]);
            return;
        }

        setIsLoading(true);
        const allianceId = userProfile.allianceId;
        
        const allianceUnsub = onSnapshot(doc(db, 'alliances', allianceId), (doc) => {
            if (doc.exists()) {
                const allianceData = { id: doc.id, ...doc.data() } as Alliance;
                setAlliance(allianceData);
                setNewAllianceName(allianceData.name);
                setNewAllianceTag(allianceData.tag);
                setNewLogoUrl(allianceData.logoUrl || 'https://placehold.co/128x128.png');
            } else {
                setAlliance(null);
            }
        });

        const membersQuery = query(collection(db, 'users'), where('allianceId', '==', allianceId));
        const membersUnsub = onSnapshot(membersQuery, (snapshot) => {
            const memberList = snapshot.docs.map(doc => ({
                id: doc.id,
                prideName: doc.data().prideName,
                pride: doc.data().pride || 0,
                land: doc.data().land || 0,
                province: doc.data().province || 'N/A',
            } as AllianceMember));
            memberList.sort((a, b) => b.land - a.land);
            setMembers(memberList);
        });

        const votesQuery = query(collection(db, 'votes'), where('allianceId', '==', allianceId));
        const votesUnsub = onSnapshot(votesQuery, (snapshot) => {
            const voteList = snapshot.docs.map(doc => ({ voterId: doc.id, ...doc.data() } as Vote));
            setVotes(voteList);
            const myVote = voteList.find(v => v.voterId === user?.uid);
            if(myVote) setSelectedCandidate(myVote.candidateId);
            setIsLoading(false);
        });
        
        // Fetch other alliances for war declaration
        const otherAlliancesQuery = query(collection(db, 'alliances'), where('__name__', '!=', allianceId));
        getDocs(otherAlliancesQuery).then(snapshot => {
            const alliancesList = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}) as Alliance);
            setOtherAlliances(alliancesList);
        });

        // Listen for active wars
        const warQuery = query(collection(db, 'wars'), where('participants', 'array-contains', allianceId));
        const warUnsub = onSnapshot(warQuery, async (snapshot) => {
            if (!snapshot.empty) {
                const warData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
                setActiveWar(warData);
                const enemyId = warData.participants.find((p: string) => p !== allianceId);
                if (enemyId) {
                    const enemyDoc = await getDoc(doc(db, 'alliances', enemyId));
                    if (enemyDoc.exists()) {
                        setEnemyAlliance({ id: enemyDoc.id, ...enemyDoc.data() } as Alliance);
                    }
                }
            } else {
                setActiveWar(null);
                setEnemyAlliance(null);
            }
        });
        
        // Listen for incoming transports
        const transportQuery = query(collection(db, 'transportQueue'), where('recipientId', '==', user.uid));
        const transportUnsub = onSnapshot(transportQuery, (snapshot) => {
            const transportList = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}) as TransportJob);
            transportList.sort((a, b) => a.arrivalTime.toMillis() - b.arrivalTime.toMillis());
            setIncomingTransports(transportList);
        });


        return () => {
            allianceUnsub();
            membersUnsub();
            votesUnsub();
            warUnsub();
            transportUnsub();
        };

    }, [userProfile?.allianceId, user?.uid]);
    
    const voteCounts = useMemo(() => {
        const counts: { [key: string]: number } = {};
        for (const vote of votes) {
            const voter = members.find(m => m.id === vote.voterId);
            if (voter) {
                const votingPower = Math.floor(voter.land / votingPowerDivisor);
                counts[vote.candidateId] = (counts[vote.candidateId] || 0) + votingPower;
            }
        }
        return counts;
    }, [votes, members, votingPowerDivisor]);

    useEffect(() => {
      const totalPossibleVotingPower = members.reduce(
        (acc, member) => acc + Math.floor(member.land / votingPowerDivisor),
        0
      );
  
      if (Object.keys(voteCounts).length > 0 && totalPossibleVotingPower > 0) {
          const sortedVotes = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);
          const topCandidateId = sortedVotes[0][0];
          const topCandidateVotePower = sortedVotes[0][1];
          const isTie = sortedVotes.length > 1 && sortedVotes[0][1] === sortedVotes[1][1];
          const hasMajority = topCandidateVotePower >= totalPossibleVotingPower * 0.5;
  
          if (!isTie && hasMajority) {
              setLeaderId(topCandidateId);
          } else {
              setLeaderId(null);
          }
      } else {
          setLeaderId(null);
      }
    }, [voteCounts, members, votingPowerDivisor]);

    const isLeader = useMemo(() => user?.uid === leaderId, [user?.uid, leaderId]);
    const isAdmin = userProfile?.role === 'admin';
    const canEditAlliance = isLeader || isAdmin;

    const userHasVoted = useMemo(() => {
        return votes.some(vote => vote.voterId === user?.uid);
    }, [votes, user?.uid]);
    
    const getTitleNameForPride = (pride: number) => {
        if (!titles || titles.length === 0) return 'Tanpa Gelar';
        const achievedTitle = [...titles].reverse().find(t => pride >= t.prideRequired);
        return achievedTitle ? achievedTitle.name : 'Tanpa Gelar';
    };

    const getMemberJabatan = (member: AllianceMember) => {
        if (!member) return null;
        const title = getTitleNameForPride(member.pride);
        return (
            <>
                <span className="text-primary">{title}</span>{' '}
                <span className="text-primary">{member.province}</span>
            </>
        );
    };
    
    const getFullMemberName = (member: AllianceMember) => {
        if (!member) return null;
        const title = getTitleNameForPride(member.pride);
        return (
            <>
                {member.prideName}{' '}
                <span className="text-sm text-muted-foreground">({title} - {member.province})</span>
            </>
        );
    }
    
    const getFullMemberNameString = (member: AllianceMember) => {
        if (!member) return '';
        const title = getTitleNameForPride(member.pride);
        return `${member.prideName} (${title} - {member.province})`;
    }

    const leaderDisplayName = useMemo(() => {
        const leader = members.find(m => m.id === leaderId);
        if (!leader) return 'Belum ada';
        return getFullMemberNameString(leader);
    }, [members, leaderId, titles]);


    const handleVote = async () => {
        if (!user || !userProfile?.allianceId || !selectedCandidate) {
            toast({ title: "Gagal memberikan suara", description: "Informasi tidak lengkap.", variant: "destructive" });
            return;
        }

        setIsVoting(true);
        try {
            const voteRef = doc(db, 'votes', user.uid);
            await setDoc(voteRef, {
                allianceId: userProfile.allianceId,
                candidateId: selectedCandidate,
            });
            const votedMember = members.find(m => m.id === selectedCandidate);
            toast({ title: "Suara berhasil diberikan!", description: `Anda telah memilih ${getFullMemberNameString(votedMember!)}.` });

            // Add to activity log
            await addDoc(collection(db, "activityLog"), {
              userId: user.uid,
              prideName: userProfile.prideName,
              type: "vote",
              message: `Memberikan suara untuk ${votedMember?.prideName || 'kandidat'} dalam pemilihan aliansi.`,
              timestamp: serverTimestamp(),
            });

        } catch (error) {
            console.error("Error casting vote:", error);
            toast({ title: "Gagal memberikan suara", description: "Terjadi kesalahan.", variant: "destructive" });
        } finally {
            setIsVoting(false);
        }
    };
    
    const handleUpdateAlliance = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userProfile?.allianceId) {
            toast({ title: "Gagal Memperbarui", description: "Anda tidak berada dalam aliansi.", variant: "destructive" });
            return;
        }
        if (!newAllianceName || !newAllianceTag) {
            toast({ title: "Input Tidak Valid", description: "Nama dan tag aliansi tidak boleh kosong.", variant: "destructive" });
            return;
        }
        setIsSaving(true);
        try {
            const allianceRef = doc(db, 'alliances', userProfile.allianceId);
            await updateDoc(allianceRef, {
                name: newAllianceName,
                tag: newAllianceTag.toUpperCase(),
            });
            toast({ title: "Aliansi Diperbarui", description: "Nama dan tag aliansi berhasil diperbarui." });
        } catch (error) {
            console.error("Error updating alliance:", error);
            toast({ title: "Gagal Memperbarui", description: "Pastikan Anda adalah pemimpin aliansi yang sah atau admin.", variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleUpdateLogo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userProfile?.allianceId) {
            toast({ title: "Gagal Memperbarui", description: "Anda tidak berada dalam aliansi.", variant: "destructive" });
            return;
        }
        if (!newLogoUrl) {
            toast({ title: "URL Logo tidak boleh kosong", variant: "destructive" });
            return;
        }
        setIsSavingLogo(true);
        try {
            const allianceRef = doc(db, 'alliances', userProfile.allianceId);
            await updateDoc(allianceRef, { logoUrl: newLogoUrl });
            toast({ title: "Logo Aliansi Diperbarui" });
            setIsLogoDialogOpen(false);
        } catch (error) {
            console.error("Error updating alliance logo:", error);
            toast({ title: "Gagal Memperbarui Logo", description: "Pastikan Anda adalah pemimpin aliansi yang sah atau admin.", variant: "destructive" });
        } finally {
            setIsSavingLogo(false);
        }
    };
    
    const handleDeclareWar = async () => {
        if (!isLeader) {
            toast({ title: "Aksi Ditolak", description: "Hanya pemimpin aliansi yang dapat mendeklarasikan perang.", variant: "destructive"});
            return;
        }
        if (!warTargetId || !userProfile?.allianceId) {
            toast({ title: "Target Tidak Valid", description: "Silakan pilih aliansi untuk diajak perang.", variant: "destructive"});
            return;
        }
        if (activeWar) {
            toast({ title: "Sudah Berperang", description: "Aliansi Anda sudah dalam kondisi perang.", variant: "destructive"});
            return;
        }

        setIsDeclaringWar(true);
        try {
            // Check if a war already exists between these two alliances
            const existingWarQuery = query(collection(db, 'wars'), where('participants', 'in', [[userProfile.allianceId, warTargetId], [warTargetId, userProfile.allianceId]]));
            const existingWarSnapshot = await getDocs(existingWarQuery);

            if (!existingWarSnapshot.empty) {
                toast({ title: "Perang Sudah Ada", description: "Sudah ada perang yang tercatat antara kedua aliansi ini.", variant: "destructive" });
                setIsDeclaringWar(false);
                return;
            }
            
            const warDurationMillis = 72 * 60 * 60 * 1000;
            const expiresAt = Timestamp.fromMillis(Date.now() + warDurationMillis);

            await addDoc(collection(db, 'wars'), {
                participants: [userProfile.allianceId, warTargetId],
                declaredBy: userProfile.allianceId,
                declaredAt: serverTimestamp(),
                expiresAt: expiresAt,
            });

            const targetAlliance = otherAlliances.find(a => a.id === warTargetId);
            toast({ title: "Perang Dideklarasikan!", description: `Aliansi Anda sekarang berperang dengan ${targetAlliance?.name}.`});
            setWarTargetId('');
        } catch (error) {
            console.error("Error declaring war:", error);
            toast({ title: "Gagal Mendeklarasikan Perang", variant: "destructive"});
        } finally {
            setIsDeclaringWar(false);
        }
    }
    
    const openAidDialog = (member: AllianceMember) => {
        setAidTarget(member);
        setMoneyToSend(0);
        setFoodToSend(0);
        setTroopsToSend({});
        setIsAidDialogOpen(true);
    };
    
    const handleSendAid = async () => {
        if (!user || !userProfile || !aidTarget || !userProfile.allianceId) {
            toast({ title: "Gagal mengirim bantuan", variant: "destructive" });
            return;
        }

        setIsSendingAid(true);
        const batch = writeBatch(db);
        const userRef = doc(db, 'users', user.uid);
        
        const totalMoney = moneyToSend || 0;
        const totalFood = foodToSend || 0;
        let totalTroopsSent = 0;
        
        const hasResources = totalMoney > 0 || totalFood > 0;
        const hasTroops = Object.values(troopsToSend).some(val => val > 0);

        if (!hasResources && !hasTroops) {
            toast({ title: "Tidak ada yang dikirim", description: "Masukkan jumlah sumber daya atau pasukan untuk dikirim.", variant: "destructive" });
            setIsSendingAid(false);
            return;
        }

        // Validate and deduct resources
        if (hasResources) {
            if (totalMoney > (userProfile.money ?? 0) || totalFood > (userProfile.food ?? 0)) {
                toast({ title: "Sumber daya tidak cukup", variant: "destructive" });
                setIsSendingAid(false);
                return;
            }
            if(totalMoney > 0) batch.update(userRef, { money: increment(-totalMoney) });
            if(totalFood > 0) batch.update(userRef, { food: increment(-totalFood) });
        }

        // Validate and deduct troops
        if (hasTroops) {
            for (const unit in troopsToSend) {
                const amount = troopsToSend[unit];
                totalTroopsSent += amount;
                if (amount > (userProfile.units?.[unit as keyof typeof userProfile.units] ?? 0)) {
                    toast({ title: "Pasukan tidak cukup", description: `Anda tidak memiliki cukup ${unit}.`, variant: "destructive" });
                    setIsSendingAid(false);
                    return;
                }
                if (amount > 0) batch.update(userRef, { [`units.${unit}`]: increment(-amount) });
            }
        }
        
        const transportTimeMinutes = 180; // 3 hours
        const arrivalTime = Timestamp.fromMillis(Date.now() + transportTimeMinutes * 60 * 1000);
        
        if (hasResources) {
             const transportRef = doc(collection(db, 'transportQueue'));
             batch.set(transportRef, {
                senderId: user.uid,
                senderName: userProfile.prideName,
                recipientId: aidTarget.id,
                recipientName: aidTarget.prideName,
                allianceId: userProfile.allianceId,
                type: 'resource',
                payload: { money: totalMoney, food: totalFood },
                createdAt: serverTimestamp(),
                arrivalTime: arrivalTime,
            });
        }
        
        if (hasTroops) {
            const transportRef = doc(collection(db, 'transportQueue'));
             batch.set(transportRef, {
                senderId: user.uid,
                senderName: userProfile.prideName,
                recipientId: aidTarget.id,
                recipientName: aidTarget.prideName,
                allianceId: userProfile.allianceId,
                type: 'troops',
                payload: { units: troopsToSend },
                createdAt: serverTimestamp(),
                arrivalTime: arrivalTime,
            });
        }

        try {
            await batch.commit();
            toast({ title: "Bantuan Terkirim", description: `Bantuan Anda sedang dalam perjalanan ke ${aidTarget.prideName}.`});
            setIsAidDialogOpen(false);
        } catch (error) {
             console.error("Error sending aid: ", error);
             toast({ title: "Gagal mengirim bantuan", description: "Terjadi kesalahan.", variant: "destructive" });
        } finally {
            setIsSendingAid(false);
        }
    };

    if (isLoading) {
        return <Card><CardContent className="p-6 text-center">Memuat data aliansi...</CardContent></Card>
    }

    if (!userProfile?.allianceId || !alliance) {
        return (
            <Card>
                <CardHeader className="text-center p-4">
                    <CardTitle className="text-xl">Anda tidak dalam Aliansi</CardTitle>
                    <CardDescription className="text-sm max-w-md mx-auto">
                        Anda saat ini tidak tergabung dalam aliansi mana pun.
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    }
    
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="text-center p-4 space-y-2">
          <CardTitle className="text-xl">Aliansi ({alliance.coordinates?.x}:{alliance.coordinates?.y}) {alliance.name}</CardTitle>
          <p className="font-mono text-muted-foreground text-lg">[{alliance.tag}]</p>
          
          <div className="relative pt-4 flex flex-col items-center gap-2">
              <Image
                  src={alliance.logoUrl || 'https://placehold.co/128x128.png'}
                  alt="Logo Aliansi"
                  width={100}
                  height={100}
                  className="rounded-lg border-2 border-primary/20 shadow-md"
                  data-ai-hint="emblem shield"
              />
              {canEditAlliance && (
                   <Dialog open={isLogoDialogOpen} onOpenChange={setIsLogoDialogOpen}>
                      <DialogTrigger asChild>
                         <Button variant="outline" size="sm">Ganti Logo</Button>
                      </DialogTrigger>
                      <DialogContent>
                          <DialogHeader>
                              <DialogTitle>Ganti Logo Aliansi</DialogTitle>
                              <DialogDescription>
                                  Masukkan URL gambar baru untuk logo aliansi Anda. Disarankan ukuran 1:1.
                              </DialogDescription>
                          </DialogHeader>
                          <form onSubmit={handleUpdateLogo} className="space-y-4 py-4">
                              <div className="grid gap-2">
                                  <Label htmlFor="logo-url">URL Logo</Label>
                                  <Input
                                      id="logo-url"
                                      value={newLogoUrl}
                                      onChange={e => setNewLogoUrl(e.target.value)}
                                      placeholder="https://placehold.co/128x128.png"
                                      required
                                  />
                              </div>
                              <DialogFooter>
                                  <Button type="button" variant="ghost" onClick={() => setIsLogoDialogOpen(false)}>Batal</Button>
                                  <Button type="submit" disabled={isSavingLogo}>
                                      {isSavingLogo ? "Menyimpan..." : "Simpan"}
                                  </Button>
                              </DialogFooter>
                          </form>
                      </DialogContent>
                  </Dialog>
              )}
          </div>
          <p className="text-sm text-primary pt-2">Pemimpin Saat Ini: <span>{leaderDisplayName}</span></p>
        </CardHeader>
        <CardContent className="space-y-6 p-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Pride</TableHead>
                  <TableHead>Jabatan</TableHead>
                  <TableHead className="text-right">Tanah</TableHead>
                  <TableHead className="text-right">Suara Diterima</TableHead>
                  <TableHead className="text-right">Hak Pilih</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.length > 0 ? members.map(member => (
                  <TableRow key={member.id}>
                      <TableCell className="flex items-center gap-2">
                          {member.id === leaderId && <Crown className="h-4 w-4 text-yellow-500" />}
                          {member.prideName}
                      </TableCell>
                      <TableCell>{getMemberJabatan(member)}</TableCell>
                      <TableCell className="text-right">{member.land.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{(voteCounts[member.id] || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{Math.floor(member.land / votingPowerDivisor).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {member.id !== user?.uid && (
                           <Button variant="outline" size="sm" onClick={() => openAidDialog(member)}>Kirim Bantuan</Button>
                        )}
                      </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">Tidak ada anggota dalam aliansi ini.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="border-t border-border pt-6">
              <h3 className="text-lg text-center mb-4 text-accent">Berikan Suaramu</h3>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <div className="flex items-center gap-2">
                      <span className="text-sm">Pilih Kandidat:</span>
                      <Select onValueChange={setSelectedCandidate} value={selectedCandidate}>
                          <SelectTrigger className="w-[220px] bg-input/50">
                              <SelectValue placeholder="Pilih seorang pemain..." />
                          </SelectTrigger>
                          <SelectContent>
                              {members.map(member => (
                                  <SelectItem key={member.id} value={member.id}>{getFullMemberName(member)}</SelectItem>
                              ))}
                          </SelectContent>
                      </Select>
                  </div>
                  <Button 
                      className="bg-accent text-accent-foreground hover:bg-accent/90" 
                      onClick={handleVote}
                      disabled={isVoting || !selectedCandidate}
                  >
                      {isVoting ? "Memberikan Suara..." : (userHasVoted ? "Ubah Pilihan Suara" : "Berikan Suara")}
                  </Button>
              </div>
          </div>

          {canEditAlliance && (
              <>
              <Separator />
              <div className="pt-2">
                  <h3 className="text-lg text-center mb-4 text-primary">Manajemen Aliansi</h3>
                  <form onSubmit={handleUpdateAlliance} className="space-y-4 max-w-md mx-auto">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="grid gap-2">
                              <Label htmlFor="alliance-name">Nama Aliansi</Label>
                              <Input id="alliance-name" value={newAllianceName} onChange={e => setNewAllianceName(e.target.value)} required />
                          </div>
                          <div className="grid gap-2">
                              <Label htmlFor="alliance-tag">Tag Aliansi</Label>
                              <Input id="alliance-tag" value={newAllianceTag} onChange={e => setNewAllianceTag(e.target.value)} required maxLength={200} />
                          </div>
                      </div>
                      <Button type="submit" disabled={isSaving} className="w-full">
                          {isSaving ? "Menyimpan..." : "Simpan Perubahan"}
                      </Button>
                  </form>
              </div>
              </>
          )}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
            <CardTitle>Bantuan Masuk</CardTitle>
            <CardDescription>Sumber daya dan pasukan yang sedang dalam perjalanan menuju Anda.</CardDescription>
        </CardHeader>
        <CardContent>
            {incomingTransports.length > 0 ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Dari</TableHead>
                            <TableHead>Isi Bantuan</TableHead>
                            <TableHead className="text-right">Tiba Dalam</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {incomingTransports.map(job => (
                            <TableRow key={job.id}>
                                <TableCell>{job.senderName}</TableCell>
                                <TableCell>
                                    {job.type === 'resource' ?
                                        `Uang: ${job.payload.money.toLocaleString()}, Makanan: ${job.payload.food.toLocaleString()}` :
                                        `Pasukan: ${Object.entries(job.payload.units).map(([unit, val]) => `${unit} (${val})`).join(', ')}`
                                    }
                                </TableCell>
                                <TableCell className="text-right">
                                    <TransportCountdown arrivalTime={job.arrivalTime} />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            ) : (
                <p className="text-sm text-center text-muted-foreground">Tidak ada bantuan yang sedang dalam perjalanan.</p>
            )}
        </CardContent>
      </Card>
      
      <Card>
          <CardHeader>
              <CardTitle className="text-destructive">Diplomasi & Perang</CardTitle>
              <CardDescription>Lihat status perang atau deklarasikan perang baru jika Anda adalah pemimpin.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
                {activeWar ? (
                     <Alert variant="destructive">
                        <Swords className="h-4 w-4" />
                        <AlertTitle>Sedang Berperang!</AlertTitle>
                        <AlertDescription className="space-y-1">
                            <p>Aliansi Anda saat ini sedang berperang dengan <strong>{enemyAlliance?.name || 'aliansi musuh'}</strong>.</p>
                            {activeWar.expiresAt && (
                                <p className="flex items-center gap-2">
                                  <Hourglass className="h-4 w-4"/>
                                  <span>Perang akan berakhir dalam: <WarCountdown expiryTimestamp={activeWar.expiresAt} /></span>
                                </p>
                            )}
                        </AlertDescription>
                    </Alert>
                ) : isLeader ? (
                     <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">Sebagai pemimpin, Anda dapat mendeklarasikan perang terhadap aliansi lain. Perang akan berlangsung selama 72 jam.</p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Select onValueChange={setWarTargetId} value={warTargetId}>
                                <SelectTrigger className="w-full sm:w-[250px]">
                                    <SelectValue placeholder="Pilih Aliansi untuk diperangi..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {otherAlliances.map(a => (
                                        <SelectItem key={a.id} value={a.id}>{a.name} [{a.tag}]</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                             <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" disabled={!warTargetId || isDeclaringWar}>Deklarasikan Perang</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Deklarasikan Perang?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Apakah Anda yakin ingin mendeklarasikan perang terhadap aliansi yang dipilih? Tindakan ini akan memulai permusuhan terbuka selama 72 jam.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Batal</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDeclareWar} disabled={isDeclaringWar}>
                                            {isDeclaringWar ? "Mendeklarasikan..." : "Ya, Mulai Perang"}
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>
                ) : (
                    <Alert>
                        <Swords className="h-4 w-4" />
                        <AlertTitle>Status: Damai</AlertTitle>
                        <AlertDescription>
                            Aliansi Anda tidak sedang dalam perang. Hanya pemimpin aliansi yang dapat mendeklarasikan perang.
                        </AlertDescription>
                    </Alert>
                )}
          </CardContent>
      </Card>
      
      <Dialog open={isAidDialogOpen} onOpenChange={setIsAidDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Kirim Bantuan ke {aidTarget?.prideName}</DialogTitle>
                <DialogDescription>Pilih sumber daya atau pasukan untuk dikirim. Pengiriman membutuhkan waktu 3 jam.</DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="resources" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="resources">Sumber Daya</TabsTrigger>
                    <TabsTrigger value="troops">Pasukan</TabsTrigger>
                </TabsList>
                <TabsContent value="resources">
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="money-to-send">Uang (Anda Punya: {Math.floor(userProfile?.money ?? 0).toLocaleString()})</Label>
                            <Input id="money-to-send" type="number" min="0" max={Math.floor(userProfile?.money ?? 0)} value={moneyToSend} onChange={e => setMoneyToSend(Number(e.target.value))} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="food-to-send">Makanan (Anda Punya: {Math.floor(userProfile?.food ?? 0).toLocaleString()})</Label>
                            <Input id="food-to-send" type="number" min="0" max={Math.floor(userProfile?.food ?? 0)} value={foodToSend} onChange={e => setFoodToSend(Number(e.target.value))} />
                        </div>
                    </div>
                </TabsContent>
                <TabsContent value="troops">
                     <div className="space-y-4 py-4">
                        {Object.keys(userProfile?.units ?? {}).map(unit => (
                            <div key={unit} className="space-y-2">
                                <Label htmlFor={`troop-to-send-${unit}`} className="capitalize">{unit} (Anda Punya: {(userProfile?.units?.[unit as keyof typeof userProfile.units] ?? 0).toLocaleString()})</Label>
                                <Input id={`troop-to-send-${unit}`} type="number" min="0" max={userProfile?.units?.[unit as keyof typeof userProfile.units] ?? 0} value={troopsToSend[unit] || ''} onChange={e => setTroopsToSend(prev => ({...prev, [unit]: Number(e.target.value)}))} />
                            </div>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>
            <DialogFooter>
                <Button variant="ghost" onClick={() => setIsAidDialogOpen(false)}>Batal</Button>
                <Button onClick={handleSendAid} disabled={isSendingAid}>
                    {isSendingAid ? 'Mengirim...' : 'Kirim Bantuan'}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
