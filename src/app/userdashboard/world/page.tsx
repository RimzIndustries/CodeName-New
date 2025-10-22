
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { Crown, Map, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Alliance {
    id: string;
    name: string;
    tag: string;
    logoUrl?: string;
    memberCount: number;
    totalPride: number;
    totalLand: number;
}

interface UserDoc {
    allianceId?: string;
    pride: number;
    land: number;
}

type SortKey = 'totalPride' | 'totalLand' | 'memberCount';
type SortDirection = 'asc' | 'desc';

export default function WorldPage() {
    const { toast } = useToast();
    const [alliances, setAlliances] = useState<Alliance[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [sortKey, setSortKey] = useState<SortKey>('totalPride');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [alliancesSnapshot, usersSnapshot] = await Promise.all([
                    getDocs(collection(db, 'alliances')),
                    getDocs(collection(db, 'users'))
                ]);

                const userStatsByAlliance = new Map<string, { pride: number; land: number; members: number }>();

                usersSnapshot.forEach(doc => {
                    const data = doc.data() as UserDoc;
                    if (data.allianceId) {
                        const stats = userStatsByAlliance.get(data.allianceId) || { pride: 0, land: 0, members: 0 };
                        stats.pride += data.pride || 0;
                        stats.land += data.land || 0;
                        stats.members += 1;
                        userStatsByAlliance.set(data.allianceId, stats);
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

            } catch (error) {
                console.error("Error fetching world data:", error);
                toast({ title: "Gagal memuat data dunia", variant: "destructive" });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [toast]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('desc');
        }
    };
    
    const sortedAlliances = useMemo(() => {
        return [...alliances].sort((a, b) => {
            const valA = a[sortKey];
            const valB = b[sortKey];
            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [alliances, sortKey, sortDirection]);

    const renderSortArrow = (key: SortKey) => {
        if (sortKey !== key) return null;
        return sortDirection === 'asc' ? '▲' : '▼';
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>Peringkat Aliansi Dunia</CardTitle>
                    <CardDescription>Lihat perbandingan kekuatan semua aliansi di dunia Code Name.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <p className="text-center text-muted-foreground">Memuat peringkat aliansi...</p>
                    ) : alliances.length === 0 ? (
                        <p className="text-center text-muted-foreground">Belum ada aliansi yang terbentuk di dunia ini.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">#</TableHead>
                                    <TableHead>Aliansi</TableHead>
                                    <TableHead className="text-center">
                                         <Button variant="ghost" onClick={() => handleSort('memberCount')}>
                                            <Users className="h-4 w-4 mr-2" />
                                            Anggota {renderSortArrow('memberCount')}
                                        </Button>
                                    </TableHead>
                                    <TableHead className="text-right">
                                        <Button variant="ghost" onClick={() => handleSort('totalPride')}>
                                            <Crown className="h-4 w-4 mr-2" />
                                            Total Pride {renderSortArrow('totalPride')}
                                        </Button>
                                    </TableHead>
                                    <TableHead className="text-right">
                                        <Button variant="ghost" onClick={() => handleSort('totalLand')}>
                                            <Map className="h-4 w-4 mr-2" />
                                            Total Tanah {renderSortArrow('totalLand')}
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
                </CardContent>
            </Card>
        </div>
    );
}
