
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
}

export default function ReportsPage() {
    const { user, userProfile } = useAuth();
    const [reports, setReports] = useState<Report[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // This is a placeholder effect. The actual data fetching is disabled.
        setIsLoading(false); 
        setReports([]);
    }, [user]);

    const getOutcomeDetails = (report: Report) => {
        const isAttacker = report.attackerName === (userProfile?.prideName);
        if (report.type === 'attack' && isAttacker) {
            return report.outcome === 'win' ? 
                { text: 'Kemenangan Menyerang', color: 'bg-green-500/20 text-green-400', icon: <Swords className="h-4 w-4" /> } :
                { text: 'Kekalahan Menyerang', color: 'bg-red-500/20 text-red-400', icon: <ShieldOff className="h-4 w-4" /> };
        } else { // defense
            return report.outcome === 'win' ?
                { text: 'Kemenangan Bertahan', color: 'bg-blue-500/20 text-blue-400', icon: <Shield className="h-4 w-4" /> } :
                { text: 'Kekalahan Bertahan', color: 'bg-yellow-500/20 text-yellow-400', icon: <Tent className="h-4 w-4" /> };
        }
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
        ) : (
            <Alert>
                <Wrench className="h-4 w-4" />
                <AlertTitle>Fitur Sedang Dalam Perbaikan</AlertTitle>
                <AlertDescription>
                    Halaman laporan pertempuran sedang dinonaktifkan sementara untuk perbaikan teknis guna meningkatkan stabilitas dan mencegah kesalahan izin. Kami akan segera mengaktifkannya kembali.
                </AlertDescription>
            </Alert>
        )}
    </div>
  );
}
