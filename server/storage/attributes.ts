import { db } from "../db";
import { attributeDefinitions, type AttributeDefinition, type AttributeDefinitionInput } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function listAttributeDefinitions(): Promise<AttributeDefinition[]> {
  return db.select().from(attributeDefinitions);
}

export async function createAttributeDefinition(data: AttributeDefinitionInput): Promise<AttributeDefinition> {
  const [attr] = await db.insert(attributeDefinitions).values(data).returning();
  return attr;
}

export async function deleteAttributeDefinition(id: number): Promise<boolean> {
  const result = await db
    .delete(attributeDefinitions)
    .where(eq(attributeDefinitions.id, id))
    .returning({ id: attributeDefinitions.id });
  return result.length > 0;
}
