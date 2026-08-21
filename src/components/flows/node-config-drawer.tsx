"use client";

import type { Node } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { extractVariableNames, MAX_ALERT_RECIPIENTS } from "./nodes/types";
import { X, Trash2, AlertTriangle, Plus, List, MessageSquareText } from "lucide-react";
import type { StaticMessageListItem } from "./nodes/types";

export const MAX_STATIC_MESSAGE_BUTTONS = 3;
export const MAX_STATIC_MESSAGE_LIST_ITEMS = 10;

export function NodeConfigDrawer({
  node,
  onChange,
  onDelete,
  onClose,
}: {
  node: Node;
  onChange: (id: string, data: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const data = node.data as Record<string, any>;

  function update(patch: Record<string, unknown>) {
    onChange(node.id, { ...data, ...patch });
  }

  return (
    <aside className="fixed inset-0 z-40 overflow-y-auto border-l border-border bg-card p-4 md:static md:z-auto md:w-80 md:shrink-0">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold uppercase text-muted-foreground">Configurar bloco</p>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Nome do bloco</Label>
          <Input value={data.label ?? ""} onChange={(e) => update({ label: e.target.value })} />
        </div>

        {node.type === "trigger" && (
          <>
            <div className="space-y-1.5">
              <Label>Tipo de gatilho</Label>
              <select
                value={data.triggerType}
                onChange={(e) => update({ triggerType: e.target.value })}
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="FIRST_MESSAGE">Primeira mensagem</option>
                <option value="KEYWORD">Palavra-chave</option>
              </select>
            </div>
            {data.triggerType === "KEYWORD" && (
              <div className="space-y-1.5">
                <Label>Palavra-chave</Label>
                <Input
                  value={data.keyword ?? ""}
                  onChange={(e) => update({ keyword: e.target.value })}
                  placeholder="ex: orçamento"
                />
              </div>
            )}
          </>
        )}

        {node.type === "aiResponse" && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={data.useGlobalPrompt}
                onChange={(e) => update({ useGlobalPrompt: e.target.checked })}
              />
              Usar o System Prompt geral (Configurações)
            </label>
            {!data.useGlobalPrompt && (
              <div className="space-y-1.5">
                <Label>Prompt específico deste bloco</Label>
                <Textarea
                  value={data.customPrompt ?? ""}
                  onChange={(e) => update({ customPrompt: e.target.value })}
                  rows={5}
                />
              </div>
            )}
          </>
        )}

        {node.type === "staticMessage" && (
          <>
            <div className="space-y-1.5">
              <Label>Mensagem</Label>
              <Textarea
                value={data.message ?? ""}
                onChange={(e) => update({ message: e.target.value })}
                rows={4}
              />
            </div>

            <label className="flex items-start gap-2 rounded-md border border-border p-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={data.waitForReply ?? false}
                onChange={(e) => update({ waitForReply: e.target.checked })}
              />
              <span>
                Aguardar resposta do cliente antes de continuar
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Só tem efeito se a mensagem for texto puro (sem botões/lista configurados). Use isso
                  como um "menu por texto" (ex: "responda com 1, 2 ou 3") quando não quiser depender de
                  botões/lista — a Evolution API/Baileys tem bugs conhecidos de renderização e até de
                  entrega dessas mensagens interativas.
                </span>
              </span>
            </label>

            <div className="space-y-1.5">
              <Label>Tipo de mensagem interativa</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={(data.interactiveType ?? "buttons") === "buttons" ? "default" : "outline"}
                  size="sm"
                  onClick={() => update({ interactiveType: "buttons" })}
                >
                  <MessageSquareText className="h-3.5 w-3.5" />
                  Botões
                </Button>
                <Button
                  type="button"
                  variant={data.interactiveType === "list" ? "default" : "outline"}
                  size="sm"
                  onClick={() => update({ interactiveType: "list" })}
                >
                  <List className="h-3.5 w-3.5" />
                  Lista
                </Button>
              </div>
            </div>

            {data.interactiveType === "list" ? (
              <StaticMessageListField
                listButtonText={data.listButtonText ?? ""}
                listItems={data.listItems ?? []}
                onChangeButtonText={(listButtonText) => update({ listButtonText })}
                onChangeItems={(listItems) => update({ listItems })}
              />
            ) : (
              <StaticMessageButtonsField
                buttons={data.buttons ?? []}
                onChange={(buttons) => update({ buttons })}
              />
            )}
          </>
        )}

        {node.type === "alertNotification" && (
          <>
            <div className="space-y-1.5">
              <Label>Números de WhatsApp dos destinatários</Label>
              <p className="text-xs text-muted-foreground">
                Até {MAX_ALERT_RECIPIENTS} números — todos recebem a mesma notificação (ex: recepção, dono,
                sócio). Inclua o DDI e o DDD, apenas números (ex: 55 + DDD + número).
              </p>
              {(() => {
                // Preserva os campos exatamente como o operador os deixou
                // (inclusive vazios, enquanto ele ainda está preenchendo) —
                // diferente de `getAlertRecipients`, que filtra vazios e é
                // usada só na hora de efetivamente disparar o alerta.
                const recipients: string[] =
                  data.recipientPhones && data.recipientPhones.length > 0
                    ? data.recipientPhones
                    : data.recipientPhone
                      ? [data.recipientPhone]
                      : [""];

                function setRecipients(next: string[]) {
                  update({ recipientPhones: next, recipientPhone: undefined });
                }

                return (
                  <div className="space-y-2">
                    {recipients.map((phone: string, index: number) => (
                      <div key={index} className="flex items-center gap-1.5">
                        <Input
                          value={phone}
                          onChange={(e) => {
                            const next = [...recipients];
                            next[index] = e.target.value;
                            setRecipients(next);
                          }}
                          placeholder={`ex: 5511999998888 (destinatário ${index + 1})`}
                        />
                        {recipients.length > 1 && (
                          <button
                            type="button"
                            title="Remover este número"
                            onClick={() => setRecipients(recipients.filter((_, i) => i !== index))}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {recipients.length < MAX_ALERT_RECIPIENTS && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setRecipients([...recipients, ""])}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Adicionar número
                      </Button>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="space-y-1.5">
              <Label>Mensagem de alerta</Label>
              <Textarea
                value={data.message ?? ""}
                onChange={(e) => update({ message: e.target.value })}
                rows={5}
                placeholder={
                  "Novo agendamento! Nome: {{nome}}, Data: {{data}}, Serviço: {{servico}}"
                }
              />
              <p className="text-xs text-muted-foreground">
                Use variáveis no formato <code>{"{{nome_da_variavel}}"}</code> para inserir dados
                capturados durante a conversa (ex: <code>{"{{nome}}"}</code>,{" "}
                <code>{"{{data}}"}</code>, <code>{"{{servico}}"}</code>). Elas são substituídas
                automaticamente pelo motor do robô ao disparar o alerta.
              </p>
              {extractVariableNames(data.message ?? "").length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {extractVariableNames(data.message ?? "").map((name) => (
                    <span
                      key={name}
                      className="rounded-full bg-rose-600/10 px-2 py-0.5 text-[10px] font-medium text-rose-700"
                    >
                      {"{{" + name + "}}"}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {node.type === "webhook" && (
          <>
            <div className="space-y-1.5">
              <Label>URL do webhook</Label>
              <Input
                value={data.url ?? ""}
                onChange={(e) => update({ url: e.target.value })}
                placeholder="https://sua-automacao.exemplo.com/webhook/..."
              />
              <p className="text-xs text-muted-foreground">
                Ao chegar neste bloco, o robô envia um POST com todas as variáveis já coletadas na
                conversa (mais o telefone do contato) em formato JSON para esta URL. Se a automação
                externa responder com um JSON, cada campo da resposta vira uma nova variável do
                fluxo — disponível nos blocos seguintes como <code>{"{{nome_do_campo}}"}</code>.
              </p>
            </div>
          </>
        )}

        {node.type === "condition" && (
          <>
            <div className="space-y-1.5">
              <Label>Variável avaliada</Label>
              <Input
                value={data.variable ?? ""}
                onChange={(e) => update({ variable: e.target.value })}
                placeholder="ex: ultima_resposta"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Operador</Label>
              <select
                value={data.operator}
                onChange={(e) => update({ operator: e.target.value })}
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="CONTAINS">Contém</option>
                <option value="EQUALS">É igual a</option>
                <option value="STARTS_WITH">Começa com</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <Input value={data.value ?? ""} onChange={(e) => update({ value: e.target.value })} />
            </div>
          </>
        )}

        <Button variant="destructive" size="sm" className="w-full" onClick={() => onDelete(node.id)}>
          <Trash2 className="h-3.5 w-3.5" />
          Remover bloco
        </Button>
      </div>
    </aside>
  );
}

function StaticMessageButtonsField({
  buttons,
  onChange,
}: {
  buttons: string[];
  onChange: (buttons: string[]) => void;
}) {
  const atLimit = buttons.length >= MAX_STATIC_MESSAGE_BUTTONS;

  function updateButtonAt(index: number, value: string) {
    onChange(buttons.map((btn, i) => (i === index ? value : btn)));
  }

  function removeButtonAt(index: number) {
    onChange(buttons.filter((_, i) => i !== index));
  }

  function addButton() {
    if (atLimit) return;
    onChange([...buttons, ""]);
  }

  return (
    <div className="space-y-1.5">
      <Label>Botões / opções</Label>

      <div className="space-y-2">
        {buttons.map((btn, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={btn}
              onChange={(e) => updateButtonAt(index, e.target.value)}
              placeholder={`Botão ${index + 1} (ex: Falar com atendente)`}
              maxLength={20}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Remover botão"
              onClick={() => removeButtonAt(index)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}

        {buttons.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum botão adicionado ainda.</p>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addButton}
        disabled={atLimit}
        className="w-full"
      >
        <Plus className="h-3.5 w-3.5" />
        Adicionar botão
      </Button>

      <p
        className={cn(
          "flex items-start gap-1.5 text-xs",
          atLimit ? "font-medium text-amber-600" : "text-muted-foreground"
        )}
      >
        {atLimit && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
        <span>
          Máximo de 3 botões permitidos por mensagem (limite da API do WhatsApp).{" "}
          <span className={atLimit ? "" : "opacity-70"}>
            ({buttons.length}/{MAX_STATIC_MESSAGE_BUTTONS})
          </span>
        </span>
      </p>
    </div>
  );
}

function slugifyListItemId(title: string, index: number) {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || `item_${index + 1}`;
}

function StaticMessageListField({
  listButtonText,
  listItems,
  onChangeButtonText,
  onChangeItems,
}: {
  listButtonText: string;
  listItems: StaticMessageListItem[];
  onChangeButtonText: (value: string) => void;
  onChangeItems: (items: StaticMessageListItem[]) => void;
}) {
  const atLimit = listItems.length >= MAX_STATIC_MESSAGE_LIST_ITEMS;

  function updateItemAt(index: number, patch: Partial<StaticMessageListItem>) {
    onChangeItems(listItems.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeItemAt(index: number) {
    onChangeItems(listItems.filter((_, i) => i !== index));
  }

  function addItem() {
    if (atLimit) return;
    onChangeItems([...listItems, { id: `item_${listItems.length + 1}`, title: "", description: "" }]);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Título do botão que abre a lista</Label>
        <Input
          value={listButtonText}
          onChange={(e) => onChangeButtonText(e.target.value)}
          placeholder="ex: Ver Opções de Serviços"
          maxLength={20}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Itens da lista</Label>

        <div className="space-y-2">
          {listItems.map((item, index) => (
            <div key={index} className="space-y-1.5 rounded-md border border-border p-2">
              <div className="flex items-center gap-2">
                <Input
                  value={item.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    // Só auto-gera o id a partir do título enquanto o usuário não
                    // tiver customizado o id manualmente (id ainda no padrão slug).
                    const shouldAutoId = !item.id || item.id === slugifyListItemId(item.title, index);
                    updateItemAt(index, {
                      title,
                      ...(shouldAutoId ? { id: slugifyListItemId(title, index) } : {}),
                    });
                  }}
                  placeholder={`Item ${index + 1} (ex: Cabelo)`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Remover item"
                  onClick={() => removeItemAt(index)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Textarea
                value={item.description ?? ""}
                onChange={(e) => updateItemAt(index, { description: e.target.value })}
                placeholder="Descrição (opcional, ex: Mechas, Corte, Progressiva...)"
                rows={2}
              />
            </div>
          ))}

          {listItems.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum item adicionado ainda.</p>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addItem}
          disabled={atLimit}
          className="mt-2 w-full"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar item
        </Button>

        <p
          className={cn(
            "flex items-start gap-1.5 pt-1.5 text-xs",
            atLimit ? "font-medium text-amber-600" : "text-muted-foreground"
          )}
        >
          {atLimit && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>
            Máximo de 10 itens permitidos por lista (limite da API do WhatsApp).{" "}
            <span className={atLimit ? "" : "opacity-70"}>
              ({listItems.length}/{MAX_STATIC_MESSAGE_LIST_ITEMS})
            </span>
          </span>
        </p>
      </div>
    </div>
  );
}
