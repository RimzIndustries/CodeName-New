
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Shield, Swords, ShieldOff, Skull, Tent, Coins, Eye, MapPin } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

interface Report {
    id: string;
    type: 'attack' | 'defense' | 'spy-sent' | 'spy-received';
    attackerName: string;
    defenderName: string;
    outcome: 'win' | 'loss' | 'draw' | 'success' | 'failure';
    unitsLostAttacker?: Record<string, number>;
    unitsLostDefender?: Record<string, number>;
    resourcesPlundered?: { money: number; food: number };
    landStolen?: number;
    intel?: {
        money: number;
        food: number;
        land: number;
        units: Record<string, number>;
        buildings: Record<string, number>;
    };
    timestamp: any;
    isRead: boolean;
}

const unitNameMap: { [key: string]: string } = {
  attack: 'Pasukan Serang',
  defense: 'Pasukan Bertahan',
  elite: 'Pasukan Elit',
  raider: 'Perampok',
  spy: 'Mata-mata'
};


export default function ReportsPage() {
    const { user } = useAuth();
    const { toast } = useToast();
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
            where('involvedUsers', 'array-contains', user.uid)
        );

        const unsubscribe = onSnapshot(reportsQuery, (snapshot) => {
            const reportList: Report[] = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                const report: Partial<Report> = { id: doc.id };

                if (data.type === 'attack') {
                    report.type = data.attackerId === user.uid ? 'attack' : 'defense';
                    report.outcome = report.type === 'attack' ? data.outcomeForAttacker : (data.outcomeForAttacker === 'win' ? 'loss' : 'win');
                    report.unitsLostAttacker = data.unitsLostAttacker;
                    report.unitsLostDefender = data.unitsLostDefender;
                    report.resourcesPlundered = data.resourcesPlundered;
                    report.landStolen = data.landStolen;
                } else if (data.type === 'spy' || data.type === 'spy-received') {
                    report.type = data.attackerId === user.uid ? 'spy-sent' : 'spy-received';
                    report.outcome = data.outcomeForAttacker;
                    if (report.outcome === 'success' && report.type === 'spy-sent') {
                        report.intel = data.intel;
                    }
                }
                
                report.attackerName = data.attackerName;
                report.defenderName = data.defenderName;
                report.timestamp = data.timestamp;
                report.isRead = data.readBy?.[user.uid] ?? false;

                reportList.push(report as Report);
            });
            
            // Sort reports on the client-side
            reportList.sort((a, b) => {
                const timeA = a.timestamp?.toDate() ?? 0;
                const timeB = b.timestamp?.toDate() ?? 0;
                return timeB - timeA;
            });
            
            setReports(reportList);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching reports:", error);
            toast({ title: "Gagal memuat laporan", variant: "destructive" });
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [user, toast]);

    const getOutcomeDetails = (report: Report) => {
        switch (report.type) {
            case 'attack':
                return report.outcome === 'win' ? 
                    { text: 'Kemenangan Menyerang', color: 'text-green-400', icon: <Swords className="h-4 w-4" /> } :
                    { text: 'Kekalahan Menyerang', color: 'text-red-400', icon: <ShieldOff className="h-4 w-4" /> };
            case 'defense':
                return report.outcome === 'win' ?
                    { text: 'Kemenangan Bertahan', color: 'text-blue-400', icon: <Shield className="h-4 w-4" /> } :
                    { text: 'Kekalahan Bertahan', color: 'text-yellow-400', icon: <Skull className="h-4 w-4" /> };
            case 'spy-sent':
                 return report.outcome === 'success' ?
                    { text: 'Spionase Berhasil', color: 'text-blue-400', icon: <Eye className="h-4 w-4" /> } :
                    { text: 'Spionase Gagal', color: 'text-red-400', icon: <Eye className="h-4 w-4" /> };
            case 'spy-received':
                return { text: 'Disusupi Mata-mata', color: 'text-yellow-400', icon: <Eye className="h-4 w-4" /> };
            default:
                return { text: 'Laporan', color: '', icon: <Shield className="h-4 w-4" /> };
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
            <CardTitle>Laporan</CardTitle>
            <CardDescription>Lihat riwayat pertempuran dan spionase Anda di sini.</CardDescription>
            </CardHeader>
        </Card>

        {isLoading ? (
            <p className="text-center text-muted-foreground">Memuat laporan...</p>
        ) : reports.length === 0 ? (
             <Alert>
                <Tent className="h-4 w-4" />
                <AlertTitle>Sepi di Perbatasan</AlertTitle>
                <AlertDescription>
                    Belum ada laporan aktivitas. Luncurkan misi untuk melihat hasilnya di sini.
                </AlertDescription>
            </Alert>
        ) : (
            <Accordion type="single" collapsible className="w-full space-y-2">
                {reports.map(report => {
                    const outcomeDetails = getOutcomeDetails(report);
                    const isSender = report.type === 'attack' || report.type === 'spy-sent';
                    const opponent = isSender ? report.defenderName : report.attackerName;
                    let title = '';
                    if (report.type === 'attack') title = `Anda menyerang ${opponent}`;
                    else if (report.type === 'defense') title = `${opponent} menyerang Anda`;
                    else if (report.type === 'spy-sent') title = `Anda memata-matai ${opponent}`;
                    else if (report.type === 'spy-received') title = `${opponent} memata-matai Anda`;
                    
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
                                    <Badge variant={report.outcome === 'win' || report.outcome === 'success' ? 'default' : 'destructive'} className={`${outcomeDetails.color.replace('text', 'bg')} bg-opacity-20`}>
                                        {outcomeDetails.text}
                                    </Badge>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="p-4 pt-0 text-sm">
                               {report.type === 'attack' || report.type === 'defense' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <h4 className="font-semibold text-red-500">Pasukan Anda yang Hilang</h4>
                                        <div className="p-2 border rounded-md bg-muted/50 text-xs space-y-1">
                                            {report.unitsLostAttacker && Object.values(isSender ? report.unitsLostAttacker : report.unitsLostDefender!).reduce((a,b) => a+b, 0) > 0 ? Object.entries(isSender ? report.unitsLostAttacker : report.unitsLostDefender!).map(([unit, count]) => (
                                                <div key={unit} className="flex justify-between">
                                                    <span>{unitNameMap[unit] || unit}:</span>
                                                    <span>{count.toLocaleString()}</span>
                                                </div>
                                            )) : <p>Tidak ada pasukan yang hilang.</p>}
                                        </div>
                                         <h4 className="font-semibold text-blue-500">Pasukan Musuh yang Hilang</h4>
                                        <div className="p-2 border rounded-md bg-muted/50 text-xs space-y-1">
                                            {report.unitsLostDefender && Object.values(isSender ? report.unitsLostDefender : report.unitsLostAttacker!).reduce((a,b) => a+b, 0) > 0 ? Object.entries(isSender ? report.unitsLostDefender : report.unitsLostAttacker!).map(([unit, count]) => (
                                                <div key={unit} className="flex justify-between">
                                                    <span>{unitNameMap[unit] || unit}:</span>
                                                    <span>{count.toLocaleString()}</span>
                                                </div>
                                            )) : <p>Tidak ada pasukan yang hilang.</p>}
                                        </div>
                                    </div>
                                    {(report.resourcesPlundered && (report.resourcesPlundered.money > 0 || report.resourcesPlundered.food > 0)) || (report.landStolen && report.landStolen > 0) ? (
                                        <div className="space-y-2">
                                            <h4 className="font-semibold text-yellow-500 flex items-center gap-2"><Coins className="h-4 w-4" /> Hasil Jarahan</h4>
                                            <div className="p-2 border rounded-md bg-muted/50 text-xs space-y-1">
                                                {report.resourcesPlundered?.money > 0 && (
                                                    <div className="flex justify-between">
                                                        <span>Uang:</span>
                                                        <span>{report.resourcesPlundered.money.toLocaleString()} uFtB</span>
                                                    </div>
                                                )}
                                                {report.resourcesPlundered?.food > 0 && (
                                                    <div className="flex justify-between">
                                                        <span>Makanan:</span>
                                                        <span>{report.resourcesPlundered.food.toLocaleString()} mFtB</span>
                                                    </div>
                                                )}
                                                {report.landStolen > 0 && (
                                                    <div className="flex justify-between items-center">
                                                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3"/>Tanah:</span>
                                                        <span>{report.landStolen.toLocaleString()} tFtB</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ): null}
                                </div>
                               ) : report.type === 'spy-sent' && report.outcome === 'success' && report.intel ? (
                                <div className="space-y-2">
                                    <h4 className="font-semibold text-blue-500">Intelijen Didapatkan</h4>
                                    <div className="p-2 border rounded-md bg-muted/50 text-xs space-y-1">
                                        <div className="flex justify-between"><span>Uang:</span> <span>{report.intel.money.toLocaleString()} uFtB</span></div>
                                        <div className="flex justify-between"><span>Makanan:</span> <span>{report.intel.food.toLocaleString()} mFtB</span></div>
                                        <div className="flex justify-between"><span>Tanah:</span> <span>{report.intel.land.toLocaleString()} tFtB</span></div>
                                        <h5 className="font-medium pt-2">Pasukan:</h5>
                                        {Object.entries(report.intel.units).map(([unit, count]) => (
                                             <div key={unit} className="flex justify-between pl-2">
                                                <span>{unitNameMap[unit] || unit}:</span>
                                                <span>{count.toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                               ) : (
                                <p className="text-muted-foreground">{report.type === 'spy-sent' && report.outcome === 'failure' ? 'Mata-mata Anda gagal menyusup dan tidak kembali.' : 'Anda diserang oleh mata-mata musuh.'}</p>
                               )}
                            </AccordionContent>
                        </AccordionItem>
                    )
                })}
            </Accordion>
        )}
    </div>
  );
}
