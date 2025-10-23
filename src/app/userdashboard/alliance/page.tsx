
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
import { Crown, Swords, Wrench, Hourglass, Handshake, Users, MapIcon, Search, Landmark } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { differenceInSeconds } from 'date-fns';

// --- Interfaces ---

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
    memberCount: number;
    totalPride: number;
    totalLand: number;
}

interface Player {
    id: string;
    prideName: string;
    allianceId?: string;
    allianceName?: string;
    pride: number;
    land: number;
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

type AllianceSortKey = 'totalPride' | 'totalLand' | 'memberCount';
type PlayerSortKey = 'pride' | 'land';
type SortDirection = 'asc' | 'desc';

// --- Countdown Components ---

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

// --- Main Page Component ---

export default function AllianceAndWorldPage() {
    const { user, userProfile } = useAuth();
    const { toast } = useToast();

    // --- State for My Alliance Tab ---
    const [myAlliance, setMyAlliance] = useState<Alliance | null>(null);
    const [members, setMembers] = useState<AllianceMember[]>([]);
    const [titles, setTitles] = useState<GameTitle[]>([]);
    const [votes, setVotes] = useState<Vote[]>([]);
    const [selectedCandidate, setSelectedCandidate] = useState<string>('');
    const [isVoting, setIsVoting] = useState(false);
    const [isLoadingMyAlliance, setIsLoadingMyAlliance] = useState(true);
    const [votingPowerDivisor, setVotingPowerDivisor] = useState(100);
    const [leaderId, setLeaderId] = useState<string | null>(null);
    const [newAllianceName, setNewAllianceName] = useState('');
    const [newAllianceTag, setNewAllianceTag] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isLogoDialogOpen, setIsLogoDialogOpen] = useState(false);
    const [newLogoUrl, setNewLogoUrl] = useState('');
    const [isSavingLogo, setIsSavingLogo] = useState(false);
    const [otherAlliances, setOtherAlliances] = useState<Omit<Alliance, 'memberCount' | 'totalPride' | 'totalLand'>[]>([]);
    const [warTargetId, setWarTargetId] = useState('');
    const [isDeclaringWar, setIsDeclaringWar] = useState(false);
    const [activeWar, setActiveWar] = useState<any | null>(null);
    const [enemyAlliance, setEnemyAlliance] = useState<Omit<Alliance, 'memberCount' | 'totalPride' | 'totalLand'> | null>(null);
    const [isAidDialogOpen, setIsAidDialogOpen] = useState(false);
    const [aidTarget, setAidTarget] = useState<AllianceMember | null>(null);
    const [moneyToSend, setMoneyToSend] = useState(0);
    const [foodToSend, setFoodToSend] = useState(0);
    const [troopsToSend, setTroopsToSend] = useState<{ [key: string]: number }>({});
    const [isSendingAid, setIsSendingAid] = useState(false);
    const [incomingTransports, setIncomingTransports] = useState<TransportJob[]>([]);

    // --- State for World Rankings Tab ---
    const [allAlliances, setAllAlliances] = useState<Alliance[]>([]);
    const [allPlayers, setAllPlayers] = useState<Player[]>([]);
    const [isLoadingWorld, setIsLoadingWorld] = useState(true);
    const [allianceSortKey, setAllianceSortKey] = useState<AllianceSortKey>('totalPride');
    const [allianceSortDirection, setAllianceSortDirection] = useState<SortDirection>('desc');
    const [playerSortKey, setPlayerSortKey] = useState<PlayerSortKey>('pride');
    const [playerSortDirection, setPlayerSortDirection] = useState<SortDirection>('desc');

    // --- State for Exploration Tab ---
    const [searchX, setSearchX] = useState('');
    const [searchY, setSearchY] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchedAlliance, setSearchedAlliance] = useState<Omit<Alliance, 'memberCount' | 'totalPride' | 'totalLand'> | null>(null);
    const [searchedAllianceMembers, setSearchedAllianceMembers] = useState<AllianceMember[]>([]);
    const [noAllianceFound, setNoAllianceFound] = useState(false);
    const [searchedAllianceVotes, setSearchedAllianceVotes] = useState<Vote[]>([]);
    const [searchedAllianceLeaderId, setSearchedAllianceLeaderId] = useState<string | null>(null);


    // --- Helper Functions ---
    const getTitleNameForPride = (pride: number) => {
        if (!titles || titles.length === 0) return 'Tanpa Gelar';
        const achievedTitle = [...titles].reverse().find(t => pride >= t.prideRequired);
        return achievedTitle ? achievedTitle.name : 'Tanpa Gelar';
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
        return `${title} - ${member.prideName} (${member.province})`;
    }

    const getMemberJabatan = (memberId: string, leaderId: string | null) => {
        if (!memberId) return '';
        return memberId === leaderId ? 'Pemimpin' : 'Anggota';
    };

    const renderSortArrow = (key: AllianceSortKey | PlayerSortKey, type: 'alliance' | 'player') => {
        const currentKey = type === 'alliance' ? allianceSortKey : playerSortKey;
        const currentDirection = type === 'alliance' ? allianceSortDirection : playerSortDirection;
        if (currentKey !== key) return null;
        return currentDirection === 'asc' ? '▲' : '▼';
    };


    // Fetch data for "My Alliance" tab
    useEffect(() => {
        // Fetch static data like titles and mechanics once
        const titlesCollectionRef = collection(db, 'titles');
        onSnapshot(titlesCollectionRef, (snapshot) => {
            const titlesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as GameTitle[];
            titlesList.sort((a, b) => a.prideRequired - b.prideRequired);
            setTitles(titlesList);
        });
        
        getDoc(doc(db, 'game-settings', 'game-mechanics')).then(docSnap => {
            if (docSnap.exists() && docSnap.data().votingPowerDivisor) {
                setVotingPowerDivisor(docSnap.data().votingPowerDivisor);
            }
        });

        // If user is not in an alliance, stop loading and return
        if (!userProfile?.allianceId || !user) {
            setIsLoadingMyAlliance(false);
            setMyAlliance(null);
            setMembers([]);
            setVotes([]);
            setIncomingTransports([]);
            return;
        }

        setIsLoadingMyAlliance(true);
        const allianceId = userProfile.allianceId;
        
        const unsubscribes: (()=>void)[] = [];

        // Alliance details
        unsubscribes.push(onSnapshot(doc(db, 'alliances', allianceId), (doc) => {
            if (doc.exists()) {
                const allianceData = { id: doc.id, ...doc.data() } as Alliance;
                setMyAlliance(allianceData);
                setNewAllianceName(allianceData.name);
                setNewAllianceTag(allianceData.tag);
                setNewLogoUrl(allianceData.logoUrl || 'https://placehold.co/128x128.png');
            } else {
                setMyAlliance(null);
            }
        }));

        // Alliance members
        unsubscribes.push(onSnapshot(query(collection(db, 'users'), where('allianceId', '==', allianceId)), (snapshot) => {
            const memberList = snapshot.docs.map(doc => ({
                id: doc.id,
                prideName: doc.data().prideName,
                pride: doc.data().pride || 0,
                land: doc.data().land || 0,
                province: doc.data().province || 'N/A',
            } as AllianceMember));
            memberList.sort((a, b) => b.land - a.land);
            setMembers(memberList);
        }));

        // Votes
        unsubscribes.push(onSnapshot(query(collection(db, 'votes'), where('allianceId', '==', allianceId)), (snapshot) => {
            const voteList = snapshot.docs.map(doc => ({ voterId: doc.id, ...doc.data() } as Vote));
            setVotes(voteList);
            const myVote = voteList.find(v => v.voterId === user?.uid);
            if(myVote) setSelectedCandidate(myVote.candidateId);
            setIsLoadingMyAlliance(false);
        }));
        
        // Other alliances for war declaration
        getDocs(query(collection(db, 'alliances'), where('__name__', '!=', allianceId))).then(snapshot => {
            const alliancesList = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}) as Omit<Alliance, 'memberCount' | 'totalPride' | 'totalLand'>);
            setOtherAlliances(alliancesList);
        });

        // Active wars
        unsubscribes.push(onSnapshot(query(collection(db, 'wars'), where('participants', 'array-contains', allianceId)), async (snapshot) => {
            if (!snapshot.empty) {
                const warData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
                setActiveWar(warData);
                const enemyId = warData.participants.find((p: string) => p !== allianceId);
                if (enemyId) {
                    const enemyDoc = await getDoc(doc(db, 'alliances', enemyId));
                    if (enemyDoc.exists()) {
                        setEnemyAlliance({ id: enemyDoc.id, ...enemyDoc.data() } as Omit<Alliance, 'memberCount' | 'totalPride' | 'totalLand'>);
                    }
                }
            } else {
                setActiveWar(null);
                setEnemyAlliance(null);
            }
        }));
        
        // Incoming transports
        unsubscribes.push(onSnapshot(query(collection(db, 'transportQueue'), where('recipientId', '==', user.uid)), (snapshot) => {
            const transportList = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}) as TransportJob);
            transportList.sort((a, b) => a.arrivalTime.toMillis() - b.arrivalTime.toMillis());
            setIncomingTransports(transportList);
        }));


        return () => unsubscribes.forEach(unsub => unsub());

    }, [userProfile?.allianceId, user?.uid]);
    
    // Fetch data for "World Rankings" tab
    useEffect(() => {
        setIsLoadingWorld(true);
        const fetchData = async () => {
            try {
                const [alliancesSnapshot, usersSnapshot] = await Promise.all([
                    getDocs(collection(db, 'alliances')),
                    getDocs(collection(db, 'users'))
                ]);

                const allianceMap = new Map<string, {name: string, tag: string}>();
                alliancesSnapshot.forEach(doc => {
                    allianceMap.set(doc.id, { name: doc.data().name, tag: doc.data().tag });
                });

                const userStatsByAlliance = new Map<string, { pride: number; land: number; members: number }>();
                const playerList: Player[] = [];

                usersSnapshot.forEach(doc => {
                    const data = doc.data();
                    if(data.role === 'user') {
                        const allianceId = data.allianceId;
                        const allianceInfo = allianceId ? allianceMap.get(allianceId) : undefined;
                        
                        playerList.push({
                            id: doc.id,
                            prideName: data.prideName,
                            allianceId: allianceId,
                            allianceName: allianceInfo?.name || 'Tanpa Aliansi',
                            pride: data.pride || 0,
                            land: data.land || 0,
                        });

                        if (allianceId) {
                            const stats = userStatsByAlliance.get(allianceId) || { pride: 0, land: 0, members: 0 };
                            stats.pride += data.pride || 0;
                            stats.land += data.land || 0;
                            stats.members += 1;
                            userStatsByAlliance.set(allianceId, stats);
                        }
                    }
                });

                const allianceList: Alliance[] = alliancesSnapshot.docs.map(doc => {
                    const data = doc.data();
                    const stats = userStatsByAlliance.get(doc.id) || { pride: 0, land: 0, members: 0 };
                    return {
                        id: doc.id,
                        name: data.name,
                        tag: data.tag,
                        logoUrl: data.logoUrl,
                        memberCount: stats.members,
                        totalPride: stats.pride,
                        totalLand: stats.land,
                        coordinates: data.coordinates,
                    };
                });

                setAllAlliances(allianceList);
                setAllPlayers(playerList);

            } catch (error) {
                console.error("Error fetching world data:", error);
                toast({ title: "Gagal memuat data dunia", variant: "destructive" });
            } finally {
                setIsLoadingWorld(false);
            }
        };
        fetchData();
    }, [toast]);
    
    // --- Memoized Calculations & Derived State ---

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
    
    const searchedAllianceVoteCounts = useMemo(() => {
        const counts: { [key: string]: number } = {};
        for (const vote of searchedAllianceVotes) {
            const voter = searchedAllianceMembers.find(m => m.id === vote.voterId);
            if (voter) {
                const votingPower = Math.floor(voter.land / votingPowerDivisor);
                counts[vote.candidateId] = (counts[vote.candidateId] || 0) + votingPower;
            }
        }
        return counts;
    }, [searchedAllianceVotes, searchedAllianceMembers, votingPowerDivisor]);

    useEffect(() => {
        const totalPossibleVotingPower = searchedAllianceMembers.reduce(
            (acc, member) => acc + Math.floor(member.land / votingPowerDivisor),0
        );
  
        if (Object.keys(searchedAllianceVoteCounts).length > 0 && totalPossibleVotingPower > 0) {
            const sortedVotes = Object.entries(searchedAllianceVoteCounts).sort((a, b) => b[1] - a[1]);
            const topCandidateId = sortedVotes[0][0];
            const topCandidateVotePower = sortedVotes[0][1];
            const isTie = sortedVotes.length > 1 && sortedVotes[0][1] === sortedVotes[1][1];
            const hasMajority = topCandidateVotePower >= totalPossibleVotingPower * 0.5;
    
            if (!isTie && hasMajority) {
                setSearchedAllianceLeaderId(topCandidateId);
            } else {
                setSearchedAllianceLeaderId(null);
            }
        } else {
            setSearchedAllianceLeaderId(null);
        }
    }, [searchedAllianceVoteCounts, searchedAllianceMembers, votingPowerDivisor]);

    const isLeader = useMemo(() => user?.uid === leaderId, [user?.uid, leaderId]);
    const isAdmin = userProfile?.role === 'admin';
    const canEditAlliance = isLeader || isAdmin;

    const userHasVoted = useMemo(() => {
        return votes.some(vote => vote.voterId === user?.uid);
    }, [votes, user?.uid]);
    
    const leaderDisplayName = useMemo(() => {
        const leader = members.find(m => m.id === leaderId);
        if (!leader) return 'Belum ada';
        return getFullMemberNameString(leader);
    }, [members, leaderId, titles]);
    
    const searchedLeaderDisplayName = useMemo(() => {
        const leader = searchedAllianceMembers.find(m => m.id === searchedAllianceLeaderId);
        if (!leader) return 'Belum ada';
        return getFullMemberNameString(leader);
    }, [searchedAllianceMembers, searchedAllianceLeaderId, titles]);

    const sortedAlliances = useMemo(() => {
        return [...allAlliances].sort((a, b) => {
            const valA = a[allianceSortKey];
            const valB = b[allianceSortKey];
            if (valA < valB) return allianceSortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return allianceSortDirection === 'asc' ? 1 : -1;
            return b.totalPride - a.totalPride;
        });
    }, [allAlliances, allianceSortKey, allianceSortDirection]);
    
    const sortedPlayers = useMemo(() => {
        return [...allPlayers].sort((a, b) => {
            const valA = a[playerSortKey];
            const valB = b[playerSortKey];
            if (valA < valB) return playerSortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return playerSortDirection === 'asc' ? 1 : -1;
            return b.pride - a.pride;
        });
    }, [allPlayers, playerSortKey, playerSortDirection]);


    // --- Event Handlers ---

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
        if (!userProfile?.allianceId) return;
        if (!newAllianceName || !newAllianceTag) {
            toast({ title: "Input Tidak Valid", variant: "destructive" });
            return;
        }
        setIsSaving(true);
        try {
            await updateDoc(doc(db, 'alliances', userProfile.allianceId), {
                name: newAllianceName,
                tag: newAllianceTag.toUpperCase(),
            });
            toast({ title: "Aliansi Diperbarui" });
        } catch (error) {
            toast({ title: "Gagal Memperbarui", variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleUpdateLogo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userProfile?.allianceId || !newLogoUrl) return;
        setIsSavingLogo(true);
        try {
            await updateDoc(doc(db, 'alliances', userProfile.allianceId), { logoUrl: newLogoUrl });
            toast({ title: "Logo Aliansi Diperbarui" });
            setIsLogoDialogOpen(false);
        } catch (error) {
            toast({ title: "Gagal Memperbarui Logo", variant: "destructive" });
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
            toast({ title: "Target Tidak Valid", variant: "destructive"});
            return;
        }
        if (activeWar) {
            toast({ title: "Sudah Berperang", variant: "destructive"});
            return;
        }

        setIsDeclaringWar(true);
        try {
            const existingWarQuery = query(collection(db, 'wars'), where('participants', 'in', [[userProfile.allianceId, warTargetId], [warTargetId, userProfile.allianceId]]));
            const existingWarSnapshot = await getDocs(existingWarQuery);
            if (!existingWarSnapshot.empty) {
                toast({ title: "Perang Sudah Ada", variant: "destructive" });
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
        if (!user || !userProfile || !aidTarget || !userProfile.allianceId) return;

        setIsSendingAid(true);
        const batch = writeBatch(db);
        const userRef = doc(db, 'users', user.uid);
        
        const totalMoney = moneyToSend || 0;
        const totalFood = foodToSend || 0;
        
        const hasResources = totalMoney > 0 || totalFood > 0;
        const hasTroops = Object.values(troopsToSend).some(val => val > 0);

        if (!hasResources && !hasTroops) {
            toast({ title: "Tidak ada yang dikirim", variant: "destructive" });
            setIsSendingAid(false);
            return;
        }

        if (hasResources) {
            if (totalMoney > (userProfile.money ?? 0) || totalFood > (userProfile.food ?? 0)) {
                toast({ title: "Sumber daya tidak cukup", variant: "destructive" });
                setIsSendingAid(false);
                return;
            }
            if(totalMoney > 0) batch.update(userRef, { money: increment(-totalMoney) });
            if(totalFood > 0) batch.update(userRef, { food: increment(-totalFood) });
        }

        if (hasTroops) {
            for (const unit in troopsToSend) {
                const amount = troopsToSend[unit];
                if (amount > (userProfile.units?.[unit as keyof typeof userProfile.units] ?? 0)) {
                    toast({ title: "Pasukan tidak cukup", variant: "destructive" });
                    setIsSendingAid(false);
                    return;
                }
                if (amount > 0) batch.update(userRef, { [`units.${unit}`]: increment(-amount) });
            }
        }
        
        const transportTimeMinutes = 180;
        const arrivalTime = Timestamp.fromMillis(Date.now() + transportTimeMinutes * 60 * 1000);
        
        if (hasResources) {
             const transportRef = doc(collection(db, 'transportQueue'));
             batch.set(transportRef, {
                senderId: user.uid, senderName: userProfile.prideName, recipientId: aidTarget.id,
                recipientName: aidTarget.prideName, allianceId: userProfile.allianceId, type: 'resource',
                payload: { money: totalMoney, food: totalFood }, createdAt: serverTimestamp(), arrivalTime: arrivalTime,
            });
        }
        
        if (hasTroops) {
            const transportRef = doc(collection(db, 'transportQueue'));
             batch.set(transportRef, {
                senderId: user.uid, senderName: userProfile.prideName, recipientId: aidTarget.id,
                recipientName: aidTarget.prideName, allianceId: userProfile.allianceId, type: 'troops',
                payload: { units: troopsToSend }, createdAt: serverTimestamp(), arrivalTime: arrivalTime,
            });
        }

        try {
            await batch.commit();
            toast({ title: "Bantuan Terkirim"});
            setIsAidDialogOpen(false);
        } catch (error) {
             toast({ title: "Gagal mengirim bantuan", variant: "destructive" });
        } finally {
            setIsSendingAid(false);
        }
    };
    
    const handleAllianceSort = (key: AllianceSortKey) => {
        if (allianceSortKey === key) {
            setAllianceSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setAllianceSortKey(key);
            setAllianceSortDirection('desc');
        }
    };
    
    const handlePlayerSort = (key: PlayerSortKey) => {
        if (playerSortKey === key) {
            setPlayerSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setPlayerSortKey(key);
            setPlayerSortDirection('desc');
        }
    };
    
    const handleSearchByCoords = async (e: React.FormEvent) => {
        e.preventDefault();
        const x = parseInt(searchX, 10);
        const y = parseInt(searchY, 10);
        
        if (isNaN(x) || isNaN(y)) {
            toast({ title: "Koordinat tidak valid", variant: "destructive" });
            return;
        }

        setIsSearching(true);
        setSearchedAlliance(null);
        setSearchedAllianceMembers([]);
        setNoAllianceFound(false);
        setSearchedAllianceVotes([]);
        setSearchedAllianceLeaderId(null);

        try {
            const alliancesQuery = query(
                collection(db, 'alliances'), 
                where('coordinates.x', '==', x), 
                where('coordinates.y', '==', y)
            );
            const allianceSnapshot = await getDocs(alliancesQuery);

            if (allianceSnapshot.empty) {
                setNoAllianceFound(true);
                setIsSearching(false);
                return;
            }

            const foundAllianceDoc = allianceSnapshot.docs[0];
            const foundAlliance = { id: foundAllianceDoc.id, ...foundAllianceDoc.data() } as Omit<Alliance, 'memberCount' | 'totalPride' | 'totalLand'>;
            setSearchedAlliance(foundAlliance);

            const membersQuery = query(collection(db, 'users'), where('allianceId', '==', foundAlliance.id));
            const votesQuery = query(collection(db, 'votes'), where('allianceId', '==', foundAlliance.id));

            const [membersSnapshot, votesSnapshot] = await Promise.all([
              getDocs(membersQuery),
              getDocs(votesQuery)
            ]);
            
            const voteList = votesSnapshot.docs.map(doc => ({ voterId: doc.id, ...doc.data() } as Vote));
            setSearchedAllianceVotes(voteList);

            const memberList = membersSnapshot.docs.map(doc => ({
                id: doc.id,
                prideName: doc.data().prideName,
                pride: doc.data().pride || 0,
                land: doc.data().land || 0,
                province: doc.data().province || 'N/A',
            } as AllianceMember));
            memberList.sort((a, b) => b.pride - a.pride);
            setSearchedAllianceMembers(memberList);

        } catch (error) {
            console.error("Error searching alliance:", error);
            toast({ title: "Gagal mencari aliansi", variant: "destructive" });
        } finally {
            setIsSearching(false);
        }
    };


    // --- Render Logic ---

    if (isLoadingMyAlliance) {
        return <Card><CardContent className="p-6 text-center">Memuat data aliansi...</CardContent></Card>
    }

    if (!userProfile?.allianceId || !myAlliance) {
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
        <Tabs defaultValue="my-alliance">
            <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="my-alliance">Aliansiku</TabsTrigger>
                <TabsTrigger value="world-rankings">Peringkat Dunia</TabsTrigger>
                <TabsTrigger value="explore">Eksplorasi</TabsTrigger>
            </TabsList>
            
            {/* My Alliance Tab */}
            <TabsContent value="my-alliance" className="space-y-6 mt-4">
              <Card>
                <CardHeader className="text-center p-4 space-y-2">
                  <CardTitle className="text-xl">Aliansi ({myAlliance.coordinates?.x}:{myAlliance.coordinates?.y}) {myAlliance.name}</CardTitle>
                  <p className="font-mono text-muted-foreground text-lg">[{myAlliance.tag}]</p>
                  <div className="relative pt-4 flex flex-col items-center gap-2">
                      <Image
                          src={myAlliance.logoUrl || 'https://placehold.co/128x128.png'}
                          alt="Logo Aliansi" width={100} height={100}
                          className="rounded-lg border-2 border-primary/20 shadow-md"
                          data-ai-hint="emblem shield"
                      />
                      {canEditAlliance && (
                           <Dialog open={isLogoDialogOpen} onOpenChange={setIsLogoDialogOpen}>
                              <DialogTrigger asChild><Button variant="outline" size="sm">Ganti Logo</Button></DialogTrigger>
                              <DialogContent>
                                  <DialogHeader>
                                      <DialogTitle>Ganti Logo Aliansi</DialogTitle>
                                      <DialogDescription>Masukkan URL gambar baru. Disarankan ukuran 1:1.</DialogDescription>
                                  </DialogHeader>
                                  <form onSubmit={handleUpdateLogo} className="space-y-4 py-4">
                                      <div className="grid gap-2">
                                          <Label htmlFor="logo-url">URL Logo</Label>
                                          <Input id="logo-url" value={newLogoUrl} onChange={e => setNewLogoUrl(e.target.value)} required />
                                      </div>
                                      <DialogFooter>
                                          <Button type="button" variant="ghost" onClick={() => setIsLogoDialogOpen(false)}>Batal</Button>
                                          <Button type="submit" disabled={isSavingLogo}>{isSavingLogo ? "Menyimpan..." : "Simpan"}</Button>
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
                      <TableHeader><TableRow><TableHead>Nama Pride</TableHead><TableHead>Jabatan</TableHead><TableHead className="text-right">Tanah</TableHead><TableHead className="text-right">Suara</TableHead><TableHead className="text-right">Hak Pilih</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {members.length > 0 ? members.map(member => (
                          <TableRow key={member.id}>
                              <TableCell className="flex items-center gap-2">{member.id === leaderId && <Crown className="h-4 w-4 text-yellow-500" />}{member.prideName}</TableCell>
                              <TableCell>{getMemberJabatan(member.id, leaderId)}</TableCell>
                              <TableCell className="text-right">{member.land.toLocaleString()}</TableCell>
                              <TableCell className="text-right">{(voteCounts[member.id] || 0).toLocaleString()}</TableCell>
                              <TableCell className="text-right">{Math.floor(member.land / votingPowerDivisor).toLocaleString()}</TableCell>
                              <TableCell className="text-right">{member.id !== user?.uid && (<Button variant="outline" size="sm" onClick={() => openAidDialog(member)}>Bantuan</Button>)}</TableCell>
                          </TableRow>
                        )) : <TableRow><TableCell colSpan={6} className="text-center">Tidak ada anggota.</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="border-t pt-6"><h3 className="text-lg text-center mb-4 text-accent">Berikan Suaramu</h3>
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                          <div className="flex items-center gap-2">
                              <span className="text-sm">Pilih Kandidat:</span>
                              <Select onValueChange={setSelectedCandidate} value={selectedCandidate}>
                                  <SelectTrigger className="w-[220px] bg-input/50"><SelectValue placeholder="Pilih pemain..." /></SelectTrigger>
                                  <SelectContent>{members.map(member => (<SelectItem key={member.id} value={member.id}>{getFullMemberName(member)}</SelectItem>))}</SelectContent>
                              </Select>
                          </div>
                          <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleVote} disabled={isVoting || !selectedCandidate}>{isVoting ? "Memberikan..." : (userHasVoted ? "Ubah Pilihan" : "Beri Suara")}</Button>
                      </div>
                  </div>

                  {canEditAlliance && (
                      <><Separator />
                      <div className="pt-2"><h3 className="text-lg text-center mb-4 text-primary">Manajemen Aliansi</h3>
                          <form onSubmit={handleUpdateAlliance} className="space-y-4 max-w-md mx-auto">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div className="grid gap-2"><Label htmlFor="alliance-name">Nama Aliansi</Label><Input id="alliance-name" value={newAllianceName} onChange={e => setNewAllianceName(e.target.value)} required /></div>
                                  <div className="grid gap-2"><Label htmlFor="alliance-tag">Tag Aliansi</Label><Input id="alliance-tag" value={newAllianceTag} onChange={e => setNewAllianceTag(e.target.value)} required maxLength={200} /></div>
                              </div>
                              <Button type="submit" disabled={isSaving} className="w-full">{isSaving ? "Menyimpan..." : "Simpan Perubahan"}</Button>
                          </form>
                      </div></>
                  )}
                </CardContent>
              </Card>
      
              <Card>
                <CardHeader><CardTitle>Bantuan Masuk</CardTitle><CardDescription>Sumber daya dan pasukan yang sedang dalam perjalanan.</CardDescription></CardHeader>
                <CardContent>
                    {incomingTransports.length > 0 ? (
                        <Table><TableHeader><TableRow><TableHead>Dari</TableHead><TableHead>Isi</TableHead><TableHead className="text-right">Tiba Dalam</TableHead></TableRow></TableHeader>
                            <TableBody>{incomingTransports.map(job => (<TableRow key={job.id}><TableCell>{job.senderName}</TableCell><TableCell>{job.type === 'resource' ? `Uang: ${job.payload.money.toLocaleString()}, Makanan: ${job.payload.food.toLocaleString()}` : `Pasukan`}</TableCell><TableCell className="text-right"><TransportCountdown arrivalTime={job.arrivalTime} /></TableCell></TableRow>))}</TableBody>
                        </Table>
                    ) : (<p className="text-sm text-center text-muted-foreground">Tidak ada bantuan yang sedang dalam perjalanan.</p>)}
                </CardContent>
              </Card>
      
              <Card>
                  <CardHeader><CardTitle className="text-destructive">Diplomasi & Perang</CardTitle><CardDescription>Lihat status perang atau deklarasikan perang baru.</CardDescription></CardHeader>
                  <CardContent className="space-y-6">
                        {activeWar ? (
                             <Alert variant="destructive"><Swords className="h-4 w-4" /><AlertTitle>Sedang Berperang!</AlertTitle>
                                <AlertDescription className="space-y-1"><p>Aliansi Anda saat ini sedang berperang dengan <strong>{enemyAlliance?.name || 'aliansi musuh'}</strong>.</p>
                                    {activeWar.expiresAt && (<p className="flex items-center gap-2"><Hourglass className="h-4 w-4"/><span>Perang akan berakhir dalam: <WarCountdown expiryTimestamp={activeWar.expiresAt} /></span></p>)}
                                </AlertDescription>
                            </Alert>
                        ) : isLeader ? (
                             <div className="space-y-4"><p className="text-sm text-muted-foreground">Sebagai pemimpin, Anda dapat mendeklarasikan perang. Perang berlangsung 72 jam.</p>
                                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                    <Select onValueChange={setWarTargetId} value={warTargetId}>
                                        <SelectTrigger className="w-full sm:w-[250px]"><SelectValue placeholder="Pilih aliansi..." /></SelectTrigger>
                                        <SelectContent>{otherAlliances.map(a => (<SelectItem key={a.id} value={a.id}>{a.name} [{a.tag}]</SelectItem>))}</SelectContent>
                                    </Select>
                                     <AlertDialog>
                                        <AlertDialogTrigger asChild><Button variant="destructive" disabled={!warTargetId || isDeclaringWar}>Deklarasikan Perang</Button></AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader><AlertDialogTitle>Deklarasikan Perang?</AlertDialogTitle><AlertDialogDescription>Tindakan ini akan memulai permusuhan selama 72 jam.</AlertDialogDescription></AlertDialogHeader>
                                            <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={handleDeclareWar} disabled={isDeclaringWar}>{isDeclaringWar ? "Mendeklarasikan..." : "Ya, Mulai Perang"}</AlertDialogAction></AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </div>
                        ) : (<Alert><Swords className="h-4 w-4" /><AlertTitle>Status: Damai</AlertTitle><AlertDescription>Aliansi Anda tidak sedang dalam perang.</AlertDescription></Alert>)}
                  </CardContent>
              </Card>
            </TabsContent>

            {/* World Rankings Tab */}
            <TabsContent value="world-rankings" className="space-y-6 mt-4">
                <Card>
                    <CardHeader><CardTitle>Peringkat Aliansi</CardTitle></CardHeader>
                    <CardContent>
                        {isLoadingWorld ? <p className="text-center py-10">Memuat...</p> : allAlliances.length === 0 ? <p className="text-center py-10">Belum ada aliansi.</p> : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px]">#</TableHead><TableHead>Aliansi</TableHead>
                                        <TableHead className="text-center"><Button variant="ghost" onClick={() => handleAllianceSort('memberCount')}><Users className="h-4 w-4 mr-2" />Anggota {renderSortArrow('memberCount', 'alliance')}</Button></TableHead>
                                        <TableHead className="text-right"><Button variant="ghost" onClick={() => handleAllianceSort('totalPride')}><Crown className="h-4 w-4 mr-2" />Total Pride {renderSortArrow('totalPride', 'alliance')}</Button></TableHead>
                                        <TableHead className="text-right"><Button variant="ghost" onClick={() => handleAllianceSort('totalLand')}><MapIcon className="h-4 w-4 mr-2" />Total Tanah {renderSortArrow('totalLand', 'alliance')}</Button></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sortedAlliances.map((alliance, index) => (
                                        <TableRow key={alliance.id}>
                                            <TableCell>{index + 1}</TableCell>
                                            <TableCell className="flex items-center gap-3">
                                                <Image src={alliance.logoUrl || 'https://placehold.co/64x64.png'} alt={`Logo ${alliance.name}`} width={40} height={40} className="rounded-md border" data-ai-hint="emblem shield"/>
                                                <div><p className="font-medium">{alliance.name}</p><p className="text-sm text-muted-foreground font-mono">[{alliance.tag}]</p></div>
                                            </TableCell>
                                            <TableCell className="text-center">{alliance.memberCount}</TableCell>
                                            <TableCell className="text-right">{(alliance.totalPride || 0).toLocaleString()}</TableCell>
                                            <TableCell className="text-right">{(alliance.totalLand || 0).toLocaleString()}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>Peringkat Pemain</CardTitle></CardHeader>
                    <CardContent>
                        {isLoadingWorld ? <p className="text-center py-10">Memuat...</p> : allPlayers.length === 0 ? <p className="text-center py-10">Belum ada pemain.</p> : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px]">#</TableHead><TableHead>Nama Pride</TableHead><TableHead>Aliansi</TableHead>
                                        <TableHead className="text-right"><Button variant="ghost" onClick={() => handlePlayerSort('pride')}><Crown className="h-4 w-4 mr-2" />Pride {renderSortArrow('pride', 'player')}</Button></TableHead>
                                        <TableHead className="text-right"><Button variant="ghost" onClick={() => handlePlayerSort('land')}><MapIcon className="h-4 w-4 mr-2" />Tanah {renderSortArrow('land', 'player')}</Button></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sortedPlayers.map((player, index) => (
                                        <TableRow key={player.id}>
                                            <TableCell>{index + 1}</TableCell>
                                            <TableCell className="font-medium">{player.prideName}</TableCell>
                                            <TableCell className="text-muted-foreground">{player.allianceName}</TableCell>
                                            <TableCell className="text-right">{(player.pride || 0).toLocaleString()}</TableCell>
                                            <TableCell className="text-right">{(player.land || 0).toLocaleString()}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </TabsContent>
            
            {/* Explore Tab */}
            <TabsContent value="explore" className="space-y-6 mt-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Eksplorasi Dunia</CardTitle>
                        <CardDescription>Cari aliansi berdasarkan koordinat mereka di peta dunia.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSearchByCoords} className="flex flex-col sm:flex-row items-center gap-4">
                            <div className="grid w-full sm:w-auto flex-1 grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label htmlFor="search-x">Koordinat X</Label>
                                    <Input id="search-x" type="number" placeholder="0" value={searchX} onChange={e => setSearchX(e.target.value)} required />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="search-y">Koordinat Y</Label>
                                    <Input id="search-y" type="number" placeholder="0" value={searchY} onChange={e => setSearchY(e.target.value)} required />
                                </div>
                            </div>
                            <Button type="submit" className="w-full sm:w-auto" disabled={isSearching}>
                                {isSearching ? 'Mencari...' : <><Search className="h-4 w-4 mr-2" /> Cari</>}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {isSearching ? (
                    <p className="text-center text-muted-foreground py-10">Mencari aliansi...</p>
                ) : searchedAlliance ? (
                    <Card>
                        <CardHeader className="text-center space-y-2">
                            <Image src={searchedAlliance.logoUrl || 'https://placehold.co/128x128.png'} alt={`Logo ${searchedAlliance.name}`} width={80} height={80} className="mx-auto rounded-lg border shadow-md" data-ai-hint="emblem shield" />
                            <CardTitle className="pt-2">{searchedAlliance.name}</CardTitle>
                            <CardDescription className="font-mono">[{searchedAlliance.tag}]</CardDescription>
                             <p className="text-sm text-primary pt-2">Pemimpin: <span>{searchedLeaderDisplayName}</span></p>
                        </CardHeader>
                        <CardContent>
                            <h4 className="mb-4 text-center text-lg font-semibold">Anggota Aliansi</h4>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nama Pride</TableHead>
                                        <TableHead>Jabatan</TableHead>
                                        <TableHead className="text-right">Pride</TableHead>
                                        <TableHead className="text-right">Tanah</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {searchedAllianceMembers.length > 0 ? (
                                        searchedAllianceMembers.map(member => (
                                            <TableRow key={member.id}>
                                                <TableCell className="flex items-center gap-2">{member.id === searchedAllianceLeaderId && <Crown className="h-4 w-4 text-yellow-500" />}{getFullMemberNameString(member)}</TableCell>
                                                <TableCell>{getMemberJabatan(member.id, searchedAllianceLeaderId)}</TableCell>
                                                <TableCell className="text-right">{member.pride.toLocaleString()}</TableCell>
                                                <TableCell className="text-right">{member.land.toLocaleString()}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center">Aliansi ini tidak memiliki anggota.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                ) : noAllianceFound ? (
                    <Alert>
                        <Landmark className="h-4 w-4" />
                        <AlertTitle>Tidak Ditemukan</AlertTitle>
                        <AlertDescription>
                            Tidak ada aliansi yang ditemukan di koordinat ({searchX}, {searchY}).
                        </AlertDescription>
                    </Alert>
                ) : null}
            </TabsContent>

        </Tabs>

      <Dialog open={isAidDialogOpen} onOpenChange={setIsAidDialogOpen}>
        <DialogContent>
            <DialogHeader><DialogTitle>Kirim Bantuan ke {aidTarget?.prideName}</DialogTitle><DialogDescription>Pengiriman membutuhkan waktu 3 jam.</DialogDescription></DialogHeader>
            <Tabs defaultValue="resources" className="w-full">
                <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="resources">Sumber Daya</TabsTrigger><TabsTrigger value="troops">Pasukan</TabsTrigger></TabsList>
                <TabsContent value="resources">
                    <div className="space-y-4 py-4">
                        <div className="space-y-2"><Label htmlFor="money-to-send">Uang (Anda Punya: {Math.floor(userProfile?.money ?? 0).toLocaleString()})</Label><Input id="money-to-send" type="number" min="0" max={Math.floor(userProfile?.money ?? 0)} value={moneyToSend} onChange={e => setMoneyToSend(Number(e.target.value))} /></div>
                         <div className="space-y-2"><Label htmlFor="food-to-send">Makanan (Anda Punya: {Math.floor(userProfile?.food ?? 0).toLocaleString()})</Label><Input id="food-to-send" type="number" min="0" max={Math.floor(userProfile?.food ?? 0)} value={foodToSend} onChange={e => setFoodToSend(Number(e.target.value))} /></div>
                    </div>
                </TabsContent>
                <TabsContent value="troops">
                     <div className="space-y-4 py-4">
                        {Object.keys(userProfile?.units ?? {}).map(unit => (
                            <div key={unit} className="space-y-2"><Label htmlFor={`troop-to-send-${unit}`} className="capitalize">{unit} (Punya: {(userProfile?.units?.[unit as keyof typeof userProfile.units] ?? 0).toLocaleString()})</Label><Input id={`troop-to-send-${unit}`} type="number" min="0" max={userProfile?.units?.[unit as keyof typeof userProfile.units] ?? 0} value={troopsToSend[unit] || ''} onChange={e => setTroopsToSend(prev => ({...prev, [unit]: Number(e.target.value)}))} /></div>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>
            <DialogFooter><Button variant="ghost" onClick={() => setIsAidDialogOpen(false)}>Batal</Button><Button onClick={handleSendAid} disabled={isSendingAid}>{isSendingAid ? 'Mengirim...' : 'Kirim Bantuan'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
