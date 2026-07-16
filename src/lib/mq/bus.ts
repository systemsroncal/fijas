/**
 * Bus de mensajes unificado: noop | rabbitmq | kafka.
 * Sin broker configurado → noop (no rompe Vercel/Netlify).
 */

export type MqDriver = 'noop' | 'rabbitmq' | 'kafka';

export type MqEvent = {
  routingKey: string;
  payload: unknown;
  key?: string;
};

function driver(): MqDriver {
  const d = (process.env.MQ_DRIVER ?? '').toLowerCase();
  if (d === 'rabbitmq' || d === 'kafka' || d === 'noop') return d;
  if (process.env.RABBITMQ_URL?.trim()) return 'rabbitmq';
  if (process.env.KAFKA_BROKERS?.trim()) return 'kafka';
  return 'noop';
}

async function publishRabbit(evt: MqEvent): Promise<void> {
  const url = process.env.RABBITMQ_URL?.trim();
  if (!url) return;
  // Dynamic import — optional dependency
  const amqp = await import('amqplib');
  const conn = await amqp.connect(url);
  try {
    const ch = await conn.createChannel();
    const ex = process.env.RABBITMQ_EXCHANGE?.trim() || 'wps.events';
    await ch.assertExchange(ex, 'topic', { durable: true });
    ch.publish(ex, evt.routingKey, Buffer.from(JSON.stringify(evt.payload)), {
      contentType: 'application/json',
      persistent: true,
      messageId: crypto.randomUUID(),
      timestamp: Date.now(),
    });
    await ch.close();
  } finally {
    await conn.close();
  }
}

async function publishKafka(evt: MqEvent): Promise<void> {
  const brokers = (process.env.KAFKA_BROKERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!brokers.length) return;
  const { Kafka, logLevel } = await import('kafkajs');
  const kafka = new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || 'wps-admin',
    brokers,
    logLevel: logLevel.ERROR,
    ssl: process.env.KAFKA_SSL === '1',
    sasl: process.env.KAFKA_SASL_USER
      ? {
          mechanism: 'plain',
          username: process.env.KAFKA_SASL_USER,
          password: process.env.KAFKA_SASL_PASS || '',
        }
      : undefined,
  });
  const topic =
    process.env.KAFKA_TOPIC_PREFIX
      ? `${process.env.KAFKA_TOPIC_PREFIX}.${evt.routingKey.replace(/\./g, '_')}`
      : `wps.${evt.routingKey.replace(/\./g, '_')}`;
  const producer = kafka.producer();
  await producer.connect();
  try {
    await producer.send({
      topic,
      messages: [
        {
          key: evt.key ?? evt.routingKey,
          value: JSON.stringify(evt.payload),
        },
      ],
    });
  } finally {
    await producer.disconnect();
  }
}

/**
 * Publica evento al bus activo. Fallos de MQ no rompen la request HTTP.
 */
export async function mqPublish(evt: MqEvent): Promise<{ ok: boolean; driver: MqDriver; error?: string }> {
  const d = driver();
  if (d === 'noop') return { ok: true, driver: 'noop' };
  try {
    if (d === 'rabbitmq') await publishRabbit(evt);
    else if (d === 'kafka') await publishKafka(evt);
    return { ok: true, driver: d };
  } catch (err) {
    console.error('[mq]', d, err);
    return {
      ok: false,
      driver: d,
      error: err instanceof Error ? err.message : 'mq publish failed',
    };
  }
}

export function mqStatus(): { driver: MqDriver; rabbitConfigured: boolean; kafkaConfigured: boolean } {
  return {
    driver: driver(),
    rabbitConfigured: Boolean(process.env.RABBITMQ_URL?.trim()),
    kafkaConfigured: Boolean(process.env.KAFKA_BROKERS?.trim()),
  };
}
