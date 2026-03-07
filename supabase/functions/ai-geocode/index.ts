import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { address, city, state } = await req.json();

    if (!address || !city || !state) {
      return new Response(
        JSON.stringify({ success: false, error: 'Endereço, cidade e estado são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'LOVABLE_API_KEY não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fullAddress = `${address}, ${city}, ${state}, Brasil`;
    console.log(`AI Geocoding address: ${fullAddress}`);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente de geocodificação. Quando receber um endereço brasileiro, retorne APENAS as coordenadas geográficas (latitude e longitude) e o endereço formatado completo. Use a tool fornecida para responder.'
          },
          {
            role: 'user',
            content: `Encontre a latitude e longitude do seguinte endereço no Brasil: "${fullAddress}". Se não conseguir encontrar o endereço exato, tente encontrar a localização mais próxima possível (como a cidade).`
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'return_geocode',
              description: 'Retorna as coordenadas geográficas de um endereço',
              parameters: {
                type: 'object',
                properties: {
                  latitude: { type: 'number', description: 'Latitude em graus decimais' },
                  longitude: { type: 'number', description: 'Longitude em graus decimais' },
                  formatted_address: { type: 'string', description: 'Endereço completo formatado encontrado' },
                  confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Nível de confiança na localização encontrada' }
                },
                required: ['latitude', 'longitude', 'formatted_address', 'confidence'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'return_geocode' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Limite de requisições excedido. Tente novamente em alguns segundos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: 'Créditos insuficientes para IA.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao consultar IA para geocodificação' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await response.json();
    console.log('AI response:', JSON.stringify(aiData));

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(
        JSON.stringify({ success: false, error: 'IA não retornou coordenadas válidas' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geocodeResult = JSON.parse(toolCall.function.arguments);
    console.log(`AI Geocode result: ${geocodeResult.formatted_address} (${geocodeResult.latitude}, ${geocodeResult.longitude}) confidence: ${geocodeResult.confidence}`);

    return new Response(
      JSON.stringify({
        success: true,
        latitude: geocodeResult.latitude,
        longitude: geocodeResult.longitude,
        formatted_address: geocodeResult.formatted_address,
        confidence: geocodeResult.confidence,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('AI Geocoding error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno ao processar geocodificação com IA' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
