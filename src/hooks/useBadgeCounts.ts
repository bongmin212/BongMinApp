import { useState, useEffect } from 'react';
import { getSupabase } from '../utils/supabaseClient';
import { Database } from '../utils/database';

interface BadgeCounts {
  orders: number;
  warehouse: number;
  warranties: number;
}

export function useBadgeCounts(): BadgeCounts {
  const [counts, setCounts] = useState<BadgeCounts>({
    orders: 0,
    warehouse: 0,
    warranties: 0,
  });

  useEffect(() => {
    const fetchCounts = async () => {
      const sb = getSupabase();
      
      if (!sb) {
        // Fallback to local database
        const orders = Database.getOrders();
        const inventory = Database.getInventory();
        const warranties = Database.getWarranties();
        
        setCounts({
          orders: orders.filter(o => o.status === 'PROCESSING').length,
          warehouse: inventory.filter(inv => 
            inv.status === 'NEEDS_UPDATE' || 
            (inv.profiles && inv.profiles.some(p => p.needsUpdate))
          ).length,
          warranties: warranties.filter(w => w.status === 'PENDING').length,
        });
        return;
      }

      try {
        // Fetch orders with PROCESSING status
        const { data: ordersData } = await sb
          .from('orders')
          .select('id, status')
          .eq('status', 'PROCESSING');

        // Fetch inventory items that need update
        const { data: inventoryData } = await sb
          .from('inventory')
          .select('id, status, profiles');

        // Fetch warranties with PENDING status
        const { data: warrantiesData } = await sb
          .from('warranties')
          .select('id, status')
          .eq('status', 'PENDING');

        const ordersCount = ordersData?.length || 0;
        
        const warehouseCount = (inventoryData || []).filter((inv: any) => {
          // Check if status is NEEDS_UPDATE
          if (inv.status === 'NEEDS_UPDATE') return true;
          // Check if any profile has needsUpdate flag
          if (inv.profiles && Array.isArray(inv.profiles)) {
            return inv.profiles.some((p: any) => p.needsUpdate === true);
          }
          return false;
        }).length;
        
        const warrantiesCount = warrantiesData?.length || 0;

        setCounts({
          orders: ordersCount,
          warehouse: warehouseCount,
          warranties: warrantiesCount,
        });
      } catch (error) {
        console.error('Error fetching badge counts:', error);
        // Keep default counts of 0 on error
      }
    };

    fetchCounts();

    // Set up real-time subscriptions for live updates
    const sb = getSupabase();
    if (sb) {
      // Subscribe to orders changes
      const ordersSubscription = sb
        .channel('badge-counts-orders')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
          },
          () => {
            fetchCounts();
          }
        )
        .subscribe();

      // Subscribe to inventory changes
      const inventorySubscription = sb
        .channel('badge-counts-inventory')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'inventory',
          },
          () => {
            fetchCounts();
          }
        )
        .subscribe();

      // Subscribe to warranties changes
      const warrantiesSubscription = sb
        .channel('badge-counts-warranties')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'warranties',
          },
          () => {
            fetchCounts();
          }
        )
        .subscribe();

      // Refresh counts periodically (every 30 seconds) as a fallback
      const interval = setInterval(fetchCounts, 30000);

      return () => {
        ordersSubscription.unsubscribe();
        inventorySubscription.unsubscribe();
        warrantiesSubscription.unsubscribe();
        clearInterval(interval);
      };
    }
  }, []);

  return counts;
}

