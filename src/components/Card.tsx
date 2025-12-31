import * as React from "react";
import { Utensils, Dumbbell } from "lucide-react";
import { OrganiserItem } from "../types";

interface CardProps {
	item: OrganiserItem;
	onImageClick?: (e: React.MouseEvent, item: OrganiserItem) => void;
	onPointerDown: (_event: React.PointerEvent<HTMLElement>) => void;
	dragSurfaceClassName: string;
}

export const Card = ({ item, onImageClick, onPointerDown, dragSurfaceClassName }: CardProps) => {
	return (
		<div className="organiser-card">
			<div className={dragSurfaceClassName} onPointerDown={onPointerDown}>
				{item.coverImage && (
					<div 
						className="card-cover"
						onPointerDown={(e) => {
							if (e.ctrlKey || e.metaKey) {
								e.preventDefault();
								e.stopPropagation();
							}
						}}
						onClick={(e) => {
							if (!e.ctrlKey && !e.metaKey) return;
							e.preventDefault();
							e.stopPropagation();
							onImageClick?.(e, item);
						}}
					>
						<img src={item.coverImage} alt={item.title} draggable={false} />
					</div>
				)}
				<div 
					className="card-header"
				>
					{item.type === 'recipe' ? <Utensils size={14} /> : <Dumbbell size={14} />}
					<div className="card-title">{item.title}</div>
				</div>
			</div>
		</div>
	);
};
