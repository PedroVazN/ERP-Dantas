import type { Purchase, Sale } from "../types";
import ContaCorrentePage from "../financeiro/pages/ContaCorrentePage";

export type ContaCorrenteModuleProps = {
  sales: Sale[];
  purchases: Purchase[];
};

export default function ContaCorrenteModule(props: ContaCorrenteModuleProps) {
  return <ContaCorrentePage sales={props.sales} purchases={props.purchases} />;
}

