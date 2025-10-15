
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Shield, Swords, ShieldOff, Skull, Tent, Coins, Wrench } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, getDocs } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';

interface Report {
    id: string;
    type: 'attack' | 'defense';
    attackerName: string;
    defenderName: string;
    outcome: 'win' | 'loss' | 'draw';
    unitsLostAttacker: Record<string, number>;
    unitsLostDefender: Record<string, number>;
    resourcesPlundered: { money: number; food: number };
    timestamp: any;
    isRead: boolean;
}

const unitNameMap: { [key: string]: string } = {
  attack: 'Pasukan Serang',
  defense: 'Pasukan Bertahan',
  elite: 'Pasukan Elit',
  raider: 'Perampok'
};


export default function ReportsPage() {
    const { user, userProfile } = useAuth();
    const [reports, setReports] = useState<Report[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const reportsQuery = query(
            collection(db, 'reports'), 
            where('involvedUsers', 'array-contains', user.uid),
            orderBy('timestamp', 'desc')
        );

        const unsubscribe = onSnapshot(reportsQuery, (snapshot) => {
            const reportList: Report[] = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                const reportType = data.attackerId === user.uid ? 'attack' : 'defense';
                let outcome: 'win' | 'loss';
                
                if (reportType === 'attack') {
                    outcome = data.outcomeForAttacker;
                } else {
                    outcome = data.outcomeForAttacker === 'win' ? 'loss' : 'win';
                }

                reportList.push({
                    id: doc.id,
                    type: reportType,
                    attackerName: data.attackerName,
                    defenderName: data.defenderName,
                    outcome: outcome,
                    unitsLostAttacker: data.unitsLostAttacker,
                    unitsLostDefender: data.unitsLostDefender,
                    resourcesPlundered: data.resourcesPlundered,
                    timestamp: data.timestamp,
                    isRead: data.readBy?.[user.uid] ?? false
                });
            });
            setReports(reportList);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching reports:", error);
            toast({ title: "Gagal memuat laporan", variant: "destructive" });
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const getOutcomeDetails = (report: Report) => {
        if (report.type === 'attack') { // You were the attacker
            return report.outcome === 'win' ? 
                { text: 'Kemenangan Menyerang', color: 'text-green-400', icon: <Swords className="h-4 w-4" /> } :
                { text: 'Kekalahan Menyerang', color: 'text-red-400', icon: <ShieldOff className="h-4 w-4" /> };
        } else { // You were the defender
            return report.outcome === 'win' ?
                { text: 'Kemenangan Bertahan', color: 'text-blue-400', icon: <Shield className="h-4 w-4" /> } :
                { text: 'Kekalahan Bertahan', color: 'text-yellow-400', icon: <Skull className="h-4 w-4" /> };
        }
    }
    
    const formatTimestamp = (timestamp: any) => {
      if (!timestamp) return 'Waktu tidak diketahui';
      return formatDistanceToNow(timestamp.toDate(), { addSuffix: true, locale: id });
    }

  return (
    <div className="space-y-4">
        <Card>
            <CardHeader className="p-4">
            <CardTitle>Laporan Pertempuran</CardTitle>
            <CardDescription>Lihat riwayat pertempuran Anda di sini, baik saat menyerang maupun bertahan.</CardDescription>
            </CardHeader>
        </Card>

        {isLoading ? (
            <p className="text-center text-muted-foreground">Memuat laporan...</p>
        ) : reports.length === 0 ? (
             <Alert>
                <Tent className="h-4 w-4" />
                <AlertTitle>Sepi di Perbatasan</AlertTitle>
                <AlertDescription>
                    Belum ada laporan pertempuran. Luncurkan serangan atau tunggu musuh datang untuk melihat hasilnya di sini.
                </AlertDescription>
            </Alert>
        ) : (
            <Accordion type="single" collapsible className="w-full space-y-2">
                {reports.map(report => {
                    const outcomeDetails = getOutcomeDetails(report);
                    const isAttack = report.type === 'attack';
                    const opponent = isAttack ? report.defenderName : report.attackerName;
                    const title = isAttack ? `Anda menyerang ${opponent}` : `${opponent} menyerang Anda`;
                    
                    return (
                        <AccordionItem value={report.id} key={report.id} className="border bg-card rounded-md">
                            <AccordionTrigger className="p-4 hover:no-underline">
                                <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-3 text-left">
                                        <div className={outcomeDetails.color}>{outcomeDetails.icon}</div>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{title}</span>
                                            <span className="text-xs text-muted-foreground">{formatTimestamp(report.timestamp)}</span>
                                        </div>
                                    </div>
                                    <Badge variant={outcomeDetails.outcome === 'win' ? 'default' : 'destructive'} className={`${outcomeDetails.color.replace('text', 'bg')} bg-opacity-20`}>
                                        {outcomeDetails.text}
                                    </Badge>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="p-4 pt-0 text-sm">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Kolom Pasukan Hilang */}
                                    <div className="space-y-2">
                                        <h4 className="font-semibold text-red-500">Pasukan Anda yang Hilang</h4>
                                        <div className="p-2 border rounded-md bg-muted/50 text-xs space-y-1">
                                            {Object.entries(report.unitsLostAttacker).length > 0 ? Object.entries(isAttack ? report.unitsLostAttacker : report.unitsLostDefender).map(([unit, count]) => (
                                                <div key={unit} className="flex justify-between">
                                                    <span>{unitNameMap[unit] || unit}:</span>
                                                    <span>{count.toLocaleString()}</span>
                                                </div>
                                            )) : <p>Tidak ada pasukan yang hilang.</p>}
                                        </div>
                                         <h4 className="font-semibold text-blue-500">Pasukan Musuh yang Hilang</h4>
                                        <div className="p-2 border rounded-md bg-muted/50 text-xs space-y-1">
                                            {Object.entries(report.unitsLostDefender).length > 0 ? Object.entries(isAttack ? report.unitsLostDefender : report.unitsLostAttacker).map(([unit, count]) => (
                                                <div key={unit} className="flex justify-between">
                                                    <span>{unitNameMap[unit] || unit}:</span>
                                                    <span>{count.toLocaleString()}</span>
                                                </div>
                                            )) : <p>Tidak ada pasukan yang hilang.</p>}
                                        </div>
                                    </div>
                                    {/* Kolom Jarahan */}
                                    {report.resourcesPlundered && (report.resourcesPlundered.money > 0 || report.resourcesPlundered.food > 0) && (
                                        <div className="space-y-2">
                                            <h4 className="font-semibold text-yellow-500 flex items-center gap-2"><Coins className="h-4 w-4" /> Hasil Jarahan</h4>
                                            <div className="p-2 border rounded-md bg-muted/50 text-xs space-y-1">
                                                <div className="flex justify-between">
                                                    <span>Uang:</span>
                                                    <span>{report.resourcesPlundered.money.toLocaleString()} uFtB</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Makanan:</span>
                                                    <span>{report.resourcesPlundered.food.toLocaleString()} mFtB</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    )
                })}
            </Accordion>
        )}
    </div>
  );
}
