
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { Crown, MapIcon as Map, Users, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


interface Alliance {
    id: string;
    name: string;
    tag: string;
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

type AllianceSortKey = 'totalPride' | 'totalLand' | 'memberCount';
type PlayerSortKey = 'pride' | 'land';
type SortDirection = 'asc' | 'desc';

export default function WorldPage() {
    const { toast } = useToast();
    const [alliances, setAlliances] = useState<Alliance[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [allianceSortKey, setAllianceSortKey] = useState<AllianceSortKey>('totalPride');
    const [allianceSortDirection, setAllianceSortDirection] = useState<SortDirection>('desc');
    
    const [playerSortKey, setPlayerSortKey] = useState<PlayerSortKey>('pride');
    const [playerSortDirection, setPlayerSortDirection] = useState<SortDirection>('desc');

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
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
                    };
                });

                setAlliances(allianceList);
                setPlayers(playerList);

            } catch (error) {
                console.error("Error fetching world data:", error);
                toast({ title: "Gagal memuat data dunia", variant: "destructive" });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [toast]);

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
    
    const sortedAlliances = useMemo(() => {
        return [...alliances].sort((a, b) => {
            const valA = a[allianceSortKey];
            const valB = b[allianceSortKey];
            if (valA < valB) return allianceSortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return allianceSortDirection === 'asc' ? 1 : -1;
            return b.totalPride - a.totalPride; // Secondary sort by pride
        });
    }, [alliances, allianceSortKey, allianceSortDirection]);
    
    const sortedPlayers = useMemo(() => {
        return [...players].sort((a, b) => {
            const valA = a[playerSortKey];
            const valB = b[playerSortKey];
            if (valA < valB) return playerSortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return playerSortDirection === 'asc' ? 1 : -1;
            return b.pride - a.pride; // Secondary sort by pride
        });
    }, [players, playerSortKey, playerSortDirection]);

    const renderSortArrow = (key: AllianceSortKey | PlayerSortKey, type: 'alliance' | 'player') => {
        const currentKey = type === 'alliance' ? allianceSortKey : playerSortKey;
        const currentDirection = type === 'alliance' ? allianceSortDirection : playerSortDirection;
        if (currentKey !== key) return null;
        return currentDirection === 'asc' ? '▲' : '▼';
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>Papan Peringkat Dunia</CardTitle>
                    <CardDescription>Lihat perbandingan kekuatan semua aliansi dan pemain di dunia Code Name.</CardDescription>
                </CardHeader>
                 <CardContent>
                    <Tabs defaultValue="alliances">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="alliances">Peringkat Aliansi</TabsTrigger>
                            <TabsTrigger value="players">Peringkat Pemain</TabsTrigger>
                        </TabsList>
                        <TabsContent value="alliances" className="mt-4">
                            {isLoading ? (
                                <p className="text-center text-muted-foreground py-10">Memuat peringkat aliansi...</p>
                            ) : alliances.length === 0 ? (
                                <p className="text-center text-muted-foreground py-10">Belum ada aliansi yang terbentuk di dunia ini.</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[50px]">#</TableHead>
                                            <TableHead>Aliansi</TableHead>
                                            <TableHead className="text-center">
                                                <Button variant="ghost" onClick={() => handleAllianceSort('memberCount')}>
                                                    <Users className="h-4 w-4 mr-2" />
                                                    Anggota {renderSortArrow('memberCount', 'alliance')}
                                                </Button>
                                            </TableHead>
                                            <TableHead className="text-right">
                                                <Button variant="ghost" onClick={() => handleAllianceSort('totalPride')}>
                                                    <Crown className="h-4 w-4 mr-2" />
                                                    Total Pride {renderSortArrow('totalPride', 'alliance')}
                                                </Button>
                                            </TableHead>
                                            <TableHead className="text-right">
                                                <Button variant="ghost" onClick={() => handleAllianceSort('totalLand')}>
                                                    <Map className="h-4 w-4 mr-2" />
                                                    Total Tanah {renderSortArrow('totalLand', 'alliance')}
                                                </Button>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sortedAlliances.map((alliance, index) => (
                                            <TableRow key={alliance.id}>
                                                <TableCell>{index + 1}</TableCell>
                                                <TableCell className="flex items-center gap-3">
                                                    <Image
                                                        src={alliance.logoUrl || 'https://placehold.co/64x64.png'}
                                                        alt={`Logo ${alliance.name}`}
                                                        width={40}
                                                        height={40}
                                                        className="rounded-md border"
                                                        data-ai-hint="emblem shield"
                                                    />
                                                    <div>
                                                        <p className="font-medium">{alliance.name}</p>
                                                        <p className="text-sm text-muted-foreground font-mono">[{alliance.tag}]</p>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">{alliance.memberCount}</TableCell>
                                                <TableCell className="text-right">{(alliance.totalPride || 0).toLocaleString()}</TableCell>
                                                <TableCell className="text-right">{(alliance.totalLand || 0).toLocaleString()}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </TabsContent>
                        <TabsContent value="players" className="mt-4">
                             {isLoading ? (
                                <p className="text-center text-muted-foreground py-10">Memuat peringkat pemain...</p>
                            ) : players.length === 0 ? (
                                <p className="text-center text-muted-foreground py-10">Belum ada pemain di dunia ini.</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[50px]">#</TableHead>
                                            <TableHead>Nama Pride</TableHead>
                                            <TableHead>Aliansi</TableHead>
                                            <TableHead className="text-right">
                                                <Button variant="ghost" onClick={() => handlePlayerSort('pride')}>
                                                    <Crown className="h-4 w-4 mr-2" />
                                                    Pride {renderSortArrow('pride', 'player')}
                                                </Button>
                                            </TableHead>
                                            <TableHead className="text-right">
                                                <Button variant="ghost" onClick={() => handlePlayerSort('land')}>
                                                    <Map className="h-4 w-4 mr-2" />
                                                    Tanah {renderSortArrow('land', 'player')}
                                                </Button>
                                            </TableHead>
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
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
