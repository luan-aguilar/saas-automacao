"use client";

import type { Node } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { extractVariableNames } from "./nodes/types";
import { X, Trash2, AlertTriangle, Plus } from "lucide-react";

export const MAX_STATIC_MESSAGE_BUTTONS = 3;

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
    <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-card p-4">
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
            <StaticMessageButtonsField
              buttons={data.buttons ?? []}
              onChange={(buttons) => update({ buttons })}
            />
          </>
        )}

        {node.type === "alertNotification" && (
          <>
            <div className="space-y-1.5">
              <Label>Número de WhatsApp do destinatário</Label>
              <Input
                value={data.recipientPhone ?? ""}
                onChange={(e) => update({ recipientPhone: e.target.value })}
                placeholder="ex: 5511999998888 (recepcionista)"
              />
              <p className="text-xs text-muted-foreground">
                Inclua o DDI e o DDD, apenas números (ex: 55 + DDD + número).
              </p>
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
