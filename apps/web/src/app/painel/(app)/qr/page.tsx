'use client';

import { useState } from 'react';
import { CounterQr } from '@/components/counter-qr';
import { Alert, Card, Field, FullPageSpinner, Select } from '@/components/ui';
import { staffApi } from '@/lib/api';
import { tr } from '@/lib/region';
import { useLoad } from '@/lib/use-load';

interface Data {
  tenant: { name: string; slug: string; signupUrl: string };
  branding: { primaryColor: string; logoUrl: string | null };
  stores: Array<{ id: string; name: string; slug: string; status: 'ACTIVE' | 'INACTIVE'; signupUrl: string }>;
}

/** QR do balcão: cartaz para o cliente entrar no programa pela câmera do celular. */
export default function CounterQrPage() {
  const { data, error } = useLoad(async (): Promise<Data> => {
    const [profile, stores] = await Promise.all([staffApi<Omit<Data, 'stores'>>('/api/admin/profile'), staffApi<Data['stores']>('/api/admin/stores')]);
    return { ...profile, stores };
  }, []);
  const [storeId, setStoreId] = useState('');

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <FullPageSpinner />;

  const active = data.stores.filter((s) => s.status === 'ACTIVE');
  const multi = active.length > 1;
  const store = multi ? active.find((s) => s.id === storeId) : undefined;
  const url = store?.signupUrl ?? data.tenant.signupUrl;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">QR do balcão</h1>
        <p className="mt-1 text-stone-600">
          {tr(
            'Imprima e deixe à vista no caixa, nas mesas ou na vitrine. O cliente aponta a câmera, cria a conta e já entra no programa do',
            'Imprima e deixe à vista no caixa, nas mesas ou na montra. O cliente aponta a câmara, cria a conta e entra logo no programa do',
          )}{' '}
          {data.tenant.name}.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card>
          {multi && (
            <div className="mx-auto mb-5 max-w-sm">
              <Field label="Unidade" hint="O cartaz mostra o nome da unidade escolhida.">
                <Select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                  <option value="">Todas as unidades</option>
                  {active.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
          <CounterQr
            tenantName={data.tenant.name}
            storeName={store?.name}
            url={url}
            logoUrl={data.branding.logoUrl}
            color={data.branding.primaryColor}
            fileName={`qr-${data.tenant.slug}${store ? `-${store.slug}` : ''}`}
          />
        </Card>

        <Card className="h-fit space-y-4 text-sm text-stone-700">
          <h2 className="font-semibold text-stone-900">{tr('Dicas para mais cadastros', 'Dicas para mais registos')}</h2>
          <Tip title="Deixe à vista">No caixa, na porta e nas mesas. Quanto mais perto de onde o cliente espera, melhor.</Tip>
          <Tip title={tr('Convide na hora de pagar', 'Convide no momento de pagar')}>
            {tr(
              <>&quot;Quer ganhar selos? É só apontar a câmera aqui.&quot; Leva menos de um minuto.</>,
              <>&quot;Quer ganhar carimbos? Basta apontar a câmara aqui.&quot; Demora menos de um minuto.</>,
            )}
          </Tip>
          <Tip title="Use nas redes">
            {tr(
              'Baixe a imagem e poste no Instagram ou mande no WhatsApp com o link.',
              'Descarregue a imagem e publique-a no Instagram ou envie-a no WhatsApp com a ligação.',
            )}
          </Tip>
          <Tip title="O cartaz usa a sua marca">{tr('Logo e cor vêm de Perfil → Aparência do cartão.', 'O logótipo e a cor vêm de Perfil → Aparência do cartão.')}</Tip>
        </Card>
      </div>
    </div>
  );
}

function Tip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-medium text-stone-900">{title}</p>
      <p className="text-stone-600">{children}</p>
    </div>
  );
}
